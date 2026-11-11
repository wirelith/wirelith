#!/usr/bin/env node
// SPDX-License-Identifier: MIT

// The Wirelith conformance runner. It tests any implementation, in any language, through up to
// three commands. Each command reads a source on stdin and writes its result on stdout:
//
//   --tree <command>         the syntax tree, as JSON (spec section 13)
//   --diagnostics <command>  the diagnostics, as a JSON array (spec section 15)
//   --svg <command>          the SVG document (spec section 12)
//
// Render options for a case, when it has any, are passed as JSON in the WIRELITH_OPTIONS
// environment variable. Leave out a command to skip that kind of check.
//
// Other options:
//   --cases <dir>        the cases folder (default: conformance/cases next to this runner)
//   --only <a,b>         run only the named cases
//   --report <file>      also write a JSON report
//   --timeout <ms>       per command (default 10000)
//
// Exit status: 0 when every check run passed, 1 when any failed, 2 on a usage error.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseSvg } from './normalise.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i] ?? '';
    if (!k.startsWith('--') || argv[i + 1] === undefined) usage(`unexpected argument ${k}`);
    out[k.slice(2)] = argv[++i] ?? '';
  }
  return out;
}

/** @param {string} why @returns {never} */
function usage(why) {
  console.error(`conformance: ${why}`);
  console.error(
    'usage: run.mjs [--tree <cmd>] [--diagnostics <cmd>] [--svg <cmd>] [--cases <dir>] [--only <a,b>] [--report <file>]',
  );
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
const casesDir = args.cases ?? join(here, '..', 'cases');
const timeout = Number(args.timeout ?? 10000);
const commands = { tree: args.tree, diagnostics: args.diagnostics, svg: args.svg };
if (!commands.tree && !commands.diagnostics && !commands.svg)
  usage('give at least one of --tree, --diagnostics or --svg');

/** Runs a command with the source on stdin. */
function run(
  /** @type {string} */ command,
  /** @type {Buffer} */ input,
  /** @type {string | undefined} */ options,
) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env };
  if (options === undefined) delete env.WIRELITH_OPTIONS;
  else env.WIRELITH_OPTIONS = options;
  const r = spawnSync(command, { shell: true, input, env, timeout, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { ok: false, out: '', error: String(r.error.message) };
  if (r.status !== 0)
    return {
      ok: false,
      out: r.stdout.toString('utf8'),
      error: `exit ${r.status}: ${r.stderr.toString('utf8').slice(0, 500)}`,
    };
  return { ok: true, out: r.stdout.toString('utf8') };
}

/** Compares two values as JSON data, ignoring member order. */
function sameData(/** @type {unknown} */ a, /** @type {unknown} */ b) {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}
/** @param {unknown} v @returns {unknown} */
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(/** @type {Record<string, unknown>} */ (v)[k])]),
    );
  }
  return v;
}

/** The parts of a diagnostic the suite compares (spec section 15). */
const essential = (/** @type {any[]} */ ds) =>
  ds.map((d) => ({ code: d.code, severity: d.severity, line: d.line, column: d.column }));

const all = readdirSync(casesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const only = args.only ? args.only.split(',').filter((n) => n !== '') : undefined;
const unknown = only?.filter((n) => !all.includes(n)) ?? [];
// A misspelt or stale case name must not look like a pass.
if (unknown.length > 0) usage(`no such case: ${unknown.join(', ')}`);
const names = only ? all.filter((n) => only.includes(n)) : all;
if (names.length === 0) usage(`no cases to run in ${casesDir}`);

/** @type {{ case: string, kind: string, pass: boolean, detail?: string | undefined }[]} */
const results = [];
for (const name of names) {
  const dir = join(casesDir, name);
  const input = readFileSync(join(dir, 'input.wirelith'));
  const optionsPath = join(dir, 'options.json');
  const options = existsSync(optionsPath)
    ? JSON.stringify(JSON.parse(readFileSync(optionsPath, 'utf8')))
    : undefined;
  const check = (
    /** @type {string} */ kind,
    /** @type {() => { pass: boolean, detail?: string | undefined }} */ f,
  ) => {
    try {
      results.push({ case: name, kind, ...f() });
    } catch (e) {
      results.push({ case: name, kind, pass: false, detail: String(/** @type {Error} */ (e).message) });
    }
  };

  if (commands.diagnostics) {
    check('diagnostics', () => {
      const want = JSON.parse(readFileSync(join(dir, 'diagnostics.json'), 'utf8'));
      const r = run(/** @type {string} */ (commands.diagnostics), input, options);
      if (!r.ok) return { pass: false, detail: r.error };
      const got = essential(JSON.parse(r.out));
      return sameData(got, essential(want))
        ? { pass: true }
        : { pass: false, detail: `expected ${JSON.stringify(essential(want))}, got ${JSON.stringify(got)}` };
    });
  }
  if (commands.tree && existsSync(join(dir, 'tree.json'))) {
    check('tree', () => {
      const want = JSON.parse(readFileSync(join(dir, 'tree.json'), 'utf8'));
      const r = run(/** @type {string} */ (commands.tree), input, options);
      if (!r.ok) return { pass: false, detail: r.error };
      return sameData(JSON.parse(r.out), want) ? { pass: true } : { pass: false, detail: 'the tree differs' };
    });
  }
  if (commands.svg && existsSync(join(dir, 'output.svg'))) {
    check('svg', () => {
      const want = normaliseSvg(readFileSync(join(dir, 'output.svg'), 'utf8'));
      const r = run(/** @type {string} */ (commands.svg), input, options);
      if (!r.ok) return { pass: false, detail: r.error };
      const got = normaliseSvg(r.out);
      if (got === want) return { pass: true };
      let k = 0;
      while (k < got.length && got[k] === want[k]) k++;
      return {
        pass: false,
        detail: `first difference at character ${k}: expected ${JSON.stringify(want.slice(k, k + 60))}, got ${JSON.stringify(got.slice(k, k + 60))}`,
      };
    });
  }
}

const passed = results.filter((r) => r.pass).length;
const byKind = /** @type {Record<string, { passed: number, total: number }>} */ ({});
for (const r of results) {
  const k = byKind[r.kind] ?? { passed: 0, total: 0 };
  byKind[r.kind] = k;
  k.total++;
  if (r.pass) k.passed++;
}
for (const r of results.filter((x) => !x.pass)) console.log(`FAIL ${r.case} (${r.kind}): ${r.detail ?? ''}`);
for (const [kind, n] of Object.entries(byKind)) console.log(`${kind}: ${n.passed}/${n.total} passed`);
console.log(`conformance: ${passed}/${results.length} checks passed across ${names.length} cases.`);
if (args.report) {
  writeFileSync(
    args.report,
    `${JSON.stringify({ spec: '0.1', cases: names.length, checks: results.length, passed, byKind, results }, null, 2)}\n`,
  );
}
process.exit(passed === results.length ? 0 : 1);
