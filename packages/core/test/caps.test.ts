// SPDX-License-Identifier: MIT

// Every size cap in spec section 16 is enforced: at the limit a source is accepted, one past it
// it is rejected with E701 alone.

import { describe, expect, it } from 'vitest';
import { render, validate } from '../src/index.js';

const codes = (src: string) => validate(src).map((d) => d.code);
const lines = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('\n');

describe('size caps', () => {
  it('source size: 65,536 bytes of UTF-8', () => {
    const head = 'screen "A"\n// ';
    const at = `${head}${'x'.repeat(65536 - head.length - 1)}\n`;
    expect(new TextEncoder().encode(at).length).toBe(65536);
    expect(codes(at)).not.toContain('E701');
    expect(codes(`${at} `)).toEqual(['E701']);
    // Multi-byte characters count as bytes, not characters.
    const wide = `${head}${'é'.repeat(32767)}`;
    expect(new TextEncoder().encode(wide).length).toBeGreaterThan(65536);
    expect(codes(wide)).toEqual(['E701']);
  });

  it('elements: 2,000', () => {
    // One row of badges, so the canvas stays small: screen + row + badges.
    const src = (n: number) => `screen "A"\n  row\n${lines(n - 2, () => '    badge "x"')}\n`;
    expect(codes(src(2000))).not.toContain('E701');
    expect(codes(src(2001))).toEqual(['E701']);
  });

  it('screens: 50', () => {
    // Small screens, so that 50 of them side by side fit the 16,000 px canvas.
    const src = (n: number) => lines(n, (i) => `screen "S${i}" size=100x100`);
    expect(codes(src(50))).not.toContain('E701');
    expect(codes(src(51))).toEqual(['E701']);
  });

  it('nesting depth: 16', () => {
    const src = (depth: number) =>
      lines(depth, (i) => `${'  '.repeat(i)}${i === 0 ? 'screen "A"' : 'column'}`);
    expect(codes(src(16))).not.toContain('E701');
    expect(codes(src(17))).toEqual(['E701']);
  });

  it('string length: 500 code points', () => {
    expect(codes(`screen "A"\n  text "${'界'.repeat(500)}"\n`)).not.toContain('E701');
    expect(codes(`screen "A"\n  text "${'界'.repeat(501)}"\n`)).toEqual(['E701']);
    expect(codes(`screen "A"\n  input placeholder="${'x'.repeat(501)}"\n`)).toEqual(['E701']);
    expect(codes(`screen "A"\n  list [${'x'.repeat(501)}]\n`)).toEqual(['E701']);
  });

  it('list items: 100', () => {
    const list = (n: number) => `[${Array.from({ length: n }, (_, i) => `i${i}`).join(', ')}]`;
    expect(codes(`screen "A"\n  list ${list(100)}\n`)).not.toContain('E701');
    expect(codes(`screen "A"\n  list ${list(101)}\n`)).toEqual(['E701']);
  });

  it('tables: 20 columns and 200 rows', () => {
    const cols = (n: number) => `[${Array.from({ length: n }, (_, i) => `c${i}`).join(', ')}]`;
    expect(codes(`screen "A"\n  table ${cols(20)}\n`)).not.toContain('E701');
    expect(codes(`screen "A"\n  table ${cols(21)}\n`)).toEqual(['E701']);
    const rows = (n: number) => `screen "A"\n  table [a]\n${lines(n, () => '    row [x]')}\n`;
    expect(codes(rows(200))).not.toContain('E701');
    expect(codes(rows(201))).toEqual(['E701']);
    expect(codes(`screen "A"\n  table [a] rows=100\n${lines(100, () => '    row [x]')}\n`)).not.toContain(
      'E701',
    );
    expect(codes(`screen "A"\n  table [a] rows=100\n${lines(101, () => '    row [x]')}\n`)).toEqual(['E701']);
  });

  it('links and flows: 500', () => {
    const src = (n: number) =>
      `screen "A" #a\n  row\n${lines(n - 1, () => '    link "x" -> #a')}\nflow #a -> #a\n`;
    expect(codes(src(500))).not.toContain('E701');
    expect(codes(src(501))).toEqual(['E701']);
  });

  it('output canvas: 16,000 px on either side, checked after layout', () => {
    expect(render('screen "A" size=15000x800\n').svg).not.toBeNull();
    const r = render('screen "A" size=16000x800\nscreen "B" size=100x100\n');
    expect(r.svg).toBeNull();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E701']);
  });

  it('rejects a large source quickly, before reading it', () => {
    const huge = `screen "A"\n${'  label "x"\n'.repeat(20000)}`;
    const t = performance.now();
    expect(codes(huge)).toEqual(['E701']);
    expect(performance.now() - t).toBeLessThan(500);
  });
});
