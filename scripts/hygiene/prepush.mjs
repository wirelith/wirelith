// SPDX-License-Identifier: MIT

// Runs the hygiene checks on everything a push would publish. Called by .githooks/pre-push,
// which passes git's pre-push input on stdin: one "<local ref> <local sha> <remote ref>
// <remote sha>" line per ref being pushed.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ZERO = /^0+$/;
const input = readFileSync(0, 'utf8');
let failed = false;

for (const line of input.split('\n').filter(Boolean)) {
  const [localRef = '', localSha = '', remoteRef = '', remoteSha = ''] = line.split(' ');
  if (ZERO.test(localSha)) continue; // deleting a remote branch publishes nothing new
  const branch = remoteRef.replace(/^refs\/heads\//, '');
  let base = remoteSha;
  if (ZERO.test(remoteSha)) {
    // A new branch: compare with the remote's main branch.
    base = execFileSync('git', ['merge-base', 'origin/main', localSha], { encoding: 'utf8' }).trim();
  }
  console.log(`pre-push: checking ${localRef} -> ${remoteRef}`);
  for (const args of [
    ['scripts/hygiene/check-commits.mjs', '--range', base, localSha],
    ['scripts/hygiene/check-holder.mjs', '--range', base, localSha, branch],
    ['scripts/hygiene/denylist.mjs', '--range', base, localSha, branch],
  ]) {
    const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
    if (r.status !== 0) failed = true;
  }
}

if (failed) {
  console.error('pre-push: blocked. Fix the problems above, then push again.');
  process.exit(1);
}
