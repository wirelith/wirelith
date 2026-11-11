// SPDX-License-Identifier: MIT

// Fails if any installed package has a license outside the allowlist, or no clear license.
// MPL-2.0 is allowed only for the packages named below, each used unmodified.

import { execFileSync } from 'node:child_process';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'MIT OR Apache-2.0',
  'Apache-2.0 OR MIT',
]);

/** Packages allowed under MPL-2.0, with the reason. */
const MPL_ALLOWED = [
  { pattern: /^@resvg\//, why: 'the PNG rasteriser, a runtime dependency of the CLI and MCP server' },
  { pattern: /^lightningcss(?:-|$)/, why: 'a development-only dependency of the test runner' },
];

const execPath = process.env.npm_execpath;
const out = execPath
  ? execFileSync(process.execPath, [execPath, 'licenses', 'list', '--json'], { encoding: 'utf8' })
  : execFileSync('pnpm', ['licenses', 'list', '--json'], { encoding: 'utf8' });
/** @type {Record<string, { name: string, versions: string[] }[]>} */
const byLicense = JSON.parse(out);

const problems = [];
let count = 0;
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const p of pkgs) {
    count++;
    const id = `${p.name}@${p.versions.join(',')}`;
    if (ALLOWED.has(license)) continue;
    if (license === 'MPL-2.0' && MPL_ALLOWED.some((m) => m.pattern.test(p.name))) continue;
    problems.push(`${id}: license "${license}" is not allowed`);
  }
}
if (problems.length > 0) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(`licenses: ${count} packages checked, all allowed.`);
