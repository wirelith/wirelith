// SPDX-License-Identifier: MIT

// Checks @wirelith/core:
// - its package.json declares no dependencies of any kind;
// - it bundles from its own sources alone, importing nothing (no packages, no Node built-ins);
// - the minified bundle, including default font metrics and the icon subset, is at most
//   80 KB gzipped.

import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const BUDGET = 80 * 1024;
const pkg = JSON.parse(readFileSync('packages/core/package.json', 'utf8'));

const problems = [];
for (const field of [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundleDependencies',
  'bundledDependencies',
]) {
  if (pkg[field] && Object.keys(pkg[field]).length > 0) {
    problems.push(`core: "${field}" must be empty`);
  }
}

const result = await build({
  entryPoints: ['packages/core/src/index.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  metafile: true,
  logLevel: 'silent',
  plugins: [
    {
      name: 'no-imports',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          problems.push(`core: imports "${args.path}" from ${args.importer}; core may import nothing`);
          return { path: args.path, external: true };
        });
      },
    },
  ],
});

for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.startsWith('packages/core/src/')) problems.push(`core: bundle includes ${input}`);
}

const code = result.outputFiles[0]?.contents ?? new Uint8Array();
const gz = gzipSync(code, { level: 9 }).length;
if (gz > BUDGET) problems.push(`core: ${gz} bytes gzipped, over the ${BUDGET}-byte budget`);

if (problems.length > 0) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(`core: no dependencies, no imports, ${gz} bytes gzipped (budget ${BUDGET}).`);
