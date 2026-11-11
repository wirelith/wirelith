// SPDX-License-Identifier: MIT

// The commit-msg hook: checks the commit about to be made.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { commitProblems } from './lib/commits.mjs';

/** @param {string} name */
function identEmail(name) {
  const ident = execFileSync('git', ['var', name], { encoding: 'utf8' });
  return /<([^>]*)>/.exec(ident)?.[1] ?? '';
}

const file = process.argv[2];
if (!file) {
  console.error('usage: commit-msg.mjs <message file>');
  process.exit(2);
}
const message = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => !l.startsWith('#'))
  .join('\n');
const problems = commitProblems({
  sha: 'new',
  message,
  authorEmail: identEmail('GIT_AUTHOR_IDENT'),
  committerEmail: identEmail('GIT_COMMITTER_IDENT'),
});
if (problems.length > 0) {
  console.error(`commit-msg: ${problems.join('; ')}.`);
  console.error('See CONTRIBUTING.md, "Commits".');
  process.exit(1);
}
