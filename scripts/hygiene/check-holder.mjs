// SPDX-License-Identifier: MIT

// Fails if the copyright holder's name appears anywhere except LICENSE and NOTICE, including
// file names, a pull request's title and description, its branch name and its commit messages.

import { readFileSync } from 'node:fs';
import { docsFromArgs } from './lib/cli.mjs';
import { holderLines, holderWord, isAllowedPath } from './lib/holder.mjs';
import { location } from './lib/sources.mjs';

const word = holderWord(readFileSync('LICENSE', 'utf8'));
const { docs } = await docsFromArgs(process.argv.slice(2));

const found = new Set();
for (const doc of docs) {
  if (doc.path && !doc.isName && isAllowedPath(doc.path)) continue;
  for (const line of holderLines(word, doc.text)) found.add(location(doc, line));
}

if (found.size > 0) {
  console.error("holder name: the copyright holder's name may appear only in LICENSE and NOTICE. Found at:");
  for (const loc of [...found].sort()) console.error(`  ${loc}`);
  process.exit(1);
}
console.log(`holder name: ${docs.length} texts checked, none outside LICENSE and NOTICE.`);
