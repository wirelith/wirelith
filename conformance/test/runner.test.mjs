// SPDX-License-Identifier: MIT

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normaliseSvg } from '../runner/normalise.mjs';

describe('normaliseSvg', () => {
  it('removes differences that do not change the document', () => {
    const a =
      '<?xml version="1.0"?>\r\n<svg a=\'1\'>\n  <g></g>\n  <text x="1">a &#38; b &#x3C;c&gt;</text>\n  <!-- note -->\n</svg>\n';
    const b = '<svg a="1"><g/><text x="1">a &amp; b &lt;c&gt;</text></svg>';
    expect(normaliseSvg(a)).toBe(normaliseSvg(b));
    expect(normaliseSvg(b)).toBe(b);
  });

  it('keeps differences that matter: attribute order, numbers, and text', () => {
    expect(normaliseSvg('<svg a="1" b="2"/>')).not.toBe(normaliseSvg('<svg b="2" a="1"/>'));
    expect(normaliseSvg('<svg x="1.0"/>')).not.toBe(normaliseSvg('<svg x="1"/>'));
    expect(normaliseSvg('<svg><text>a  b</text></svg>')).not.toBe(
      normaliseSvg('<svg><text>a b</text></svg>'),
    );
  });
});

describe('run.mjs', () => {
  const run = (/** @type {string[]} */ args) =>
    spawnSync(process.execPath, ['conformance/runner/run.mjs', ...args], { encoding: 'utf8' });

  // An adapter over core's source, bundled for this test, so it needs no prior build.
  let adapter = '';
  let bundleDir = '';
  beforeAll(async () => {
    const { build } = await import('esbuild');
    bundleDir = mkdtempSync(join(tmpdir(), 'wl-adapter-'));
    const core = join(bundleDir, 'core.mjs');
    await build({
      entryPoints: ['packages/core/src/index.ts'],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      outfile: core,
      logLevel: 'silent',
    });
    const script = join(bundleDir, 'adapter.mjs');
    writeFileSync(
      script,
      [
        "import { readFileSync } from 'node:fs';",
        `import { parse, render, validate } from ${JSON.stringify(pathToFileURL(core).href)};`,
        "const source = readFileSync(0, 'utf8');",
        'const options = process.env.WIRELITH_OPTIONS ? JSON.parse(process.env.WIRELITH_OPTIONS) : {};',
        'const kind = process.argv[2];',
        "if (kind === 'tree') process.stdout.write(JSON.stringify(parse(source).tree));",
        "else if (kind === 'diagnostics') process.stdout.write(JSON.stringify(validate(source, options)));",
        "else process.stdout.write(render(source, options).svg ?? '');",
        '',
      ].join('\n'),
    );
    adapter = `node ${JSON.stringify(script)}`;
  });
  afterAll(() => {
    if (bundleDir) rmSync(bundleDir, { recursive: true, force: true });
  });

  it('fails an implementation that gets things wrong, and says where', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-conf-'));
    try {
      const wrong = join(dir, 'wrong.mjs');
      writeFileSync(wrong, "process.stdout.write('[]');\n");
      const r = run(['--diagnostics', `node ${wrong}`, '--only', 'diagnostic-e101-too-deep,example-2-first']);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('FAIL diagnostic-e101-too-deep (diagnostics)');
      expect(r.stdout).toContain('diagnostics: 1/2 passed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails an SVG that differs, and shows the first difference', () => {
    const r = run(['--svg', 'node -e "process.stdout.write(\'<svg/>\')"', '--only', 'example-2-first']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('first difference at character');
  });

  it('needs at least one command', () => {
    expect(run([]).status).toBe(2);
  });

  it('refuses unknown case names rather than passing an empty run', () => {
    const r = run(['--diagnostics', 'true', '--only', 'example-2-first,no-such-case']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('no such case: no-such-case');
  });

  it('passes core on a sample of cases', () => {
    const r = run([
      '--tree',
      `${adapter} tree`,
      '--diagnostics',
      `${adapter} diagnostics`,
      '--svg',
      `${adapter} svg`,
      '--only',
      'example-2-first,option-screen,specimen-ink',
    ]);
    expect(r.stdout).toContain('conformance: 9/9 checks passed');
    expect(r.status).toBe(0);
  });
});
