// SPDX-License-Identifier: MIT

// Copies the bundled fonts and their licenses from third-party/fonts into this package, so the
// published package carries them. Checks each font against its pinned SHA-256 first.

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const from = join(repo, 'third-party', 'fonts');
const to = join(here, '..', 'fonts');
const lock = JSON.parse(readFileSync(join(repo, 'spec', 'generators', 'inputs.lock.json'), 'utf8'));

mkdirSync(to, { recursive: true });
let n = 0;
for (const family of readdirSync(from).sort()) {
  for (const file of readdirSync(join(from, family)).sort()) {
    const src = join(from, family, file);
    const pinned = lock.files[`third-party/fonts/${family}/${file}`];
    const actual = createHash('sha256').update(readFileSync(src)).digest('hex');
    if (pinned !== actual) throw new Error(`${family}/${file} does not match its pinned SHA-256`);
    const target = file.endsWith('.ttf') ? file : `${family}-${file}`;
    copyFileSync(src, join(to, target));
    n++;
  }
}
console.log(`png: copied ${n} font and license files.`);
