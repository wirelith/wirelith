// SPDX-License-Identifier: MIT

// Fails if any commit has an author or committer email that is not a GitHub noreply address,
// or lacks a Signed-off-by line from its author.
//
//   --range <base> <head>   local commits
//   --github-pr             the commits of the pull request in the current GitHub Actions event

import { commitProblems } from './lib/commits.mjs';
import { readEvent } from './lib/github.mjs';
import { pullRequestCommits, rangeCommits } from './lib/sources.mjs';

const [mode, base, head] = process.argv.slice(2);
let commits;
if (mode === '--range' && base && head) {
  commits = rangeCommits(base, head);
} else if (mode === '--github-pr') {
  const event = readEvent();
  commits = await pullRequestCommits(event.pull_request, process.env.GITHUB_TOKEN);
} else {
  console.error('usage: --range <base> <head> | --github-pr');
  process.exit(2);
}

let failed = false;
for (const c of commits) {
  const problems = commitProblems(c);
  if (problems.length > 0) {
    failed = true;
    console.error(`commit ${c.sha.slice(0, 12)}: ${problems.join('; ')}.`);
  }
}
if (failed) {
  console.error('See CONTRIBUTING.md, "Commits", for how to fix this.');
  process.exit(1);
}
console.log(`commits: ${commits.length} checked, all use noreply addresses and are signed off.`);
