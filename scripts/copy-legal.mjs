// SPDX-License-Identifier: MIT

// Copies the repository's LICENSE and NOTICE into the package being packed, so every published
// package carries the license and the third-party notices (the Lucide icons and the fonts).
// Runs as each package's prepack script, in the package's folder. The copies are ignored by git:
// the copyright holder's name may appear in the repository only in the root LICENSE and NOTICE.

import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['LICENSE', 'NOTICE']) copyFileSync(join(repo, name), join(process.cwd(), name));
console.log(`copied LICENSE and NOTICE into ${process.cwd()}`);
