// SPDX-License-Identifier: MIT

// Every source file starts with an SPDX-License-Identifier: MIT comment (after a shebang, if
// it has one), and has no other license header.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SOURCE = /\.(?:ts|mts|cts|js|mjs|cjs|py|sh|ya?ml)$/;
const HOOKS = /^\.githooks\//;
const EXEMPT = new Set(['pnpm-lock.yaml']);
const EXEMPT_DIRS = /^\.changeset\//;

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter((f) => f && (SOURCE.test(f) || HOOKS.test(f)) && !EXEMPT.has(f) && !EXEMPT_DIRS.test(f));

const problems = [];
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  const first = lines[0]?.startsWith('#!') ? lines[1] : lines[0];
  if (!/^(?:\/\/|#) SPDX-License-Identifier: MIT$/.test(first ?? '')) {
    problems.push(`${f}: must start with an SPDX-License-Identifier: MIT comment`);
  }
  if (/\bCopyright\b/.test(text.split('\n').slice(0, 15).join('\n'))) {
    problems.push(`${f}: no copyright header; the SPDX line is the only header`);
  }
}
if (problems.length > 0) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(`spdx: ${files.length} source files checked.`);
