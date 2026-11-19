// SPDX-License-Identifier: MIT

// Runs the hygiene checks on everything a push would publish. Called by .githooks/pre-push,
// which passes git's pre-push input on stdin: one "<local ref> <local sha> <remote ref>
// <remote sha>" line per ref being pushed.
//
// Only commits that are not already published are checked: the branch's previous tip and every
// remote branch are left out. Otherwise a branch rebased onto main, or with main merged into it,
// would be blamed for main's commits, such as the squash merges GitHub commits under its own
// address.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ZERO = /^0+$/;
const here = dirname(fileURLToPath(import.meta.url));
const git = (/** @type {string[]} */ args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const exists = (/** @type {string} */ sha) =>
  spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' }).status === 0;

const input = readFileSync(0, 'utf8');
let failed = false;

for (const line of input.split('\n').filter(Boolean)) {
  const [localRef = '', localSha = '', remoteRef = '', remoteSha = ''] = line.split(' ');
  if (ZERO.test(localSha)) continue; // deleting a remote branch publishes nothing new
  const branch = remoteRef.replace(/^refs\/heads\//, '');
  const published = git(['for-each-ref', '--format=%(objectname)', 'refs/remotes/'])
    .split('\n')
    .filter(Boolean);
  if (!ZERO.test(remoteSha) && exists(remoteSha)) published.push(remoteSha);
  const bases = [...new Set(published)];
  const fresh = bases.length > 0 ? git(['rev-list', localSha, ...bases.map((b) => `^${b}`)]) : 'all';
  console.log(`pre-push: checking ${localRef} -> ${remoteRef}`);
  if (fresh === '') {
    console.log('pre-push: nothing new to check; every commit is already published.');
    continue;
  }
  // With nothing published yet, a lone comma means "leave nothing out": every commit is checked.
  const base = bases.length > 0 ? bases.join(',') : ',';
  for (const args of [
    [join(here, 'check-commits.mjs'), '--range', base, localSha],
    [join(here, 'check-holder.mjs'), '--range', base, localSha, branch],
    [join(here, 'denylist.mjs'), '--range', base, localSha, branch],
  ]) {
    const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
    if (r.status !== 0) failed = true;
  }
}

if (failed) {
  console.error('pre-push: blocked. Fix the problems above, then push again.');
  process.exit(1);
}
