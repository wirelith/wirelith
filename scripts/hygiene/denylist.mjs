// SPDX-License-Identifier: MIT

// Checks text against the private denylist and prints where a term occurs: a path and line
// number only. It never prints, logs or returns a term or the matched text.
//
// The list comes from WIRELITH_DENYLIST (the list itself, in CI) or WIRELITH_DENYLIST_FILE (a
// path to it, locally). In the --github-pr mode a missing list is an error. In the local modes
// it is skipped with a notice, because contributors outside the project don't have the list.

import { readFileSync } from 'node:fs';
import { docsFromArgs } from './lib/cli.mjs';
import { loadDenylist } from './lib/denylist.mjs';
import { location } from './lib/sources.mjs';

const argv = process.argv.slice(2);
const list = loadDenylist((p) => readFileSync(p, 'utf8'), process.env);

if (!list || list.size === 0) {
  if (argv[0] === '--github-pr') {
    console.error('denylist: the list is not available to this job.');
    process.exit(2);
  }
  console.log('denylist: skipped, because WIRELITH_DENYLIST_FILE is not set.');
  process.exit(0);
}

const { docs } = await docsFromArgs(argv);
const found = new Set();
for (const doc of docs) {
  for (const line of list.lines(doc.text)) found.add(location(doc, line));
}

if (found.size > 0) {
  console.error('denylist: a denied term was found at:');
  for (const loc of [...found].sort()) console.error(`  ${loc}`);
  console.error('Rewrite these places. Do not mention the term anywhere, including in commit messages.');
  process.exit(1);
}
console.log(`denylist: ${docs.length} texts checked, no matches.`);
