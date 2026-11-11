#!/usr/bin/env node
// SPDX-License-Identifier: MIT

// The conformance adapter for @wirelith/core. Reads a source on stdin and writes one result:
//
//   node conformance/adapters/core.mjs tree         the syntax tree, as JSON
//   node conformance/adapters/core.mjs diagnostics  the diagnostics, as JSON
//   node conformance/adapters/core.mjs svg          the SVG
//
// Render options come from the WIRELITH_OPTIONS environment variable, as JSON. It uses the
// built package, so run `pnpm build` first.

import { readFileSync } from 'node:fs';
import { parse, render, validate } from '../../packages/core/dist/index.js';

const source = readFileSync(0, 'utf8');
const options = process.env.WIRELITH_OPTIONS ? JSON.parse(process.env.WIRELITH_OPTIONS) : {};
const kind = process.argv[2];
if (kind === 'tree') {
  process.stdout.write(`${JSON.stringify(parse(source).tree)}\n`);
} else if (kind === 'diagnostics') {
  process.stdout.write(`${JSON.stringify(validate(source, options))}\n`);
} else if (kind === 'svg') {
  const r = render(source, options);
  if (r.svg === null) {
    console.error('the source has errors');
    process.exit(1);
  }
  process.stdout.write(r.svg);
} else {
  console.error('usage: core.mjs tree|diagnostics|svg');
  process.exit(2);
}
