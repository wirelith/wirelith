// SPDX-License-Identifier: MIT

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
  const adapter = 'node conformance/adapters/core.mjs';

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
