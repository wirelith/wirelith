// SPDX-License-Identifier: MIT

// Shared command-line handling for the content checks.
//
//   --tree                      every file in the working tree
//   --range <base> <head> <br>  files changed in a commit range, its messages, and a branch name
//   --github-pr                 the pull request in the current GitHub Actions event

import { readEvent } from './github.mjs';
import { pullRequestDocs, rangeDocs, treeDocs } from './sources.mjs';

/**
 * @param {string[]} argv
 * @returns {Promise<{ mode: string, docs: import('./sources.mjs').Doc[] }>}
 */
export async function docsFromArgs(argv) {
  const [mode, ...rest] = argv;
  if (mode === '--tree') return { mode, docs: treeDocs() };
  if (mode === '--range') {
    const [base, head, branch] = rest;
    if (!base || !head || branch === undefined) usage();
    return { mode, docs: rangeDocs(base, head, branch) };
  }
  if (mode === '--github-pr') {
    const event = readEvent();
    if (!event.pull_request) throw new Error('this event has no pull request');
    return { mode, docs: await pullRequestDocs(event.pull_request, process.env.GITHUB_TOKEN) };
  }
  usage();
}

/** @returns {never} */
function usage() {
  console.error('usage: --tree | --range <base> <head> <branch> | --github-pr');
  process.exit(2);
}
