// SPDX-License-Identifier: MIT

// Generates the reference outputs of the conformance cases from @wirelith/core.
//
//   node conformance/generate.mjs           write tree.json and output.svg for every case
//   node conformance/generate.mjs --check   fail if any committed output is out of date
//
// Each case's diagnostics.json is written by hand from the specification and is never
// generated. This script refuses to write anything if core's diagnostics for any case differ
// from it, so the reference outputs cannot quietly follow a change in core's behaviour.
// tree.json is written for sources without errors, and output.svg when the source renders.
// Run `pnpm build` first: this uses the built package.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, render, validate } from '../packages/core/dist/index.js';

const CASES = 'conformance/cases';
const check = process.argv.includes('--check');
const essential = (/** @type {any[]} */ ds) =>
  ds.map((d) => `${d.code}@${d.line}:${d.column}:${d.severity}`).join(' ');

const problems = [];
/** @type {[string, string | null][]} */
const writes = [];
for (const name of readdirSync(CASES).sort()) {
  const dir = join(CASES, name);
  const source = readFileSync(join(dir, 'input.wirelith'), 'utf8');
  const optionsPath = join(dir, 'options.json');
  const options = existsSync(optionsPath) ? JSON.parse(readFileSync(optionsPath, 'utf8')) : {};
  const want = JSON.parse(readFileSync(join(dir, 'diagnostics.json'), 'utf8'));
  const got = validate(source, options);
  if (essential(got) !== essential(want)) {
    problems.push(
      `${name}: diagnostics.json says ${essential(want) || 'none'}, core reports ${essential(got) || 'none'}`,
    );
    continue;
  }
  const hasErrors = got.some((d) => d.severity === 'error');
  writes.push([
    join(dir, 'tree.json'),
    hasErrors ? null : `${JSON.stringify(parse(source).tree, null, 2)}\n`,
  ]);
  const svg = hasErrors ? null : render(source, options).svg;
  writes.push([join(dir, 'output.svg'), svg]);
}

if (problems.length > 0) {
  for (const p of problems) console.error(p);
  console.error('conformance: nothing written. Fix core or the expected diagnostics first.');
  process.exit(1);
}

let stale = 0;
for (const [path, text] of writes) {
  const exists = existsSync(path);
  const current = exists ? readFileSync(path, 'utf8') : null;
  if (current === text) continue;
  if (check) {
    console.error(`${path} is out of date; run node conformance/generate.mjs`);
    stale++;
  } else if (text === null) {
    rmSync(path);
  } else {
    writeFileSync(path, text);
  }
}
if (stale > 0) process.exit(1);
console.log(
  check ? 'conformance outputs: up to date.' : `conformance outputs: written for ${writes.length / 2} cases.`,
);
