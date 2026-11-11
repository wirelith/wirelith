// SPDX-License-Identifier: MIT

// Layout rules (spec sections 10 and 11) and number formatting (section 12.2).

import { describe, expect, it } from 'vitest';
import { layout } from '../src/index.js';
import { share } from '../src/layout.js';
import { measure, r, truncate, wrap } from '../src/measure.js';
import { fmt, fmt4 } from '../src/svg.js';

const els = (src: string) => {
  const L = layout(src);
  expect(L.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return Object.fromEntries((L.frames[0]?.elements ?? []).map((e) => [e.id, e]));
};

describe('rounding and sharing (10.1)', () => {
  it('rounds to the nearest half pixel, halves up', () => {
    expect([r(1.24), r(1.25), r(1.74), r(1.75), r(-1.25), r(-1.3)]).toEqual([1, 1.5, 1.5, 2, -1, -1.5]);
  });

  it('shares room equally with the remainder in the last share', () => {
    expect(share(100, 3)).toEqual([33.5, 33.5, 33]);
    expect(share(10, 4)).toEqual([2.5, 2.5, 2.5, 2.5]);
    expect(share(7, 2)).toEqual([3.5, 3.5]);
  });
});

describe('number formatting (12.2)', () => {
  it('writes at most one decimal, no trailing zero, no -0', () => {
    expect([fmt(12), fmt(12.5), fmt(-3), fmt(-0), fmt(0.05)]).toEqual(['12', '12.5', '-3', '0', '0.1']);
    expect([fmt4(16 / 24), fmt4(20 / 24), fmt4(1), fmt4(2.25)]).toEqual(['0.6667', '0.8333', '1', '2.25']);
  });
});

describe('text (11)', () => {
  const f = { font: 'sans' as const, weight: 400, size: 15 };

  it('measures in font units, scaled once', () => {
    // Inter regular: "n" is 1210 units at 2048 per em.
    expect(measure('n', f)).toBe(r((1210 * 15) / 2048));
    expect(measure('nn', f)).toBe(r((2420 * 15) / 2048));
  });

  it('measures unknown and astral characters with the default advance', () => {
    expect(measure('中', f)).toBe(r((1344 * 15) / 2048));
    expect(measure('😀', f)).toBe(r((2 * 1344 * 15) / 2048));
  });

  it('wraps greedily at spaces and line breaks', () => {
    expect(wrap('aa bb cc', f, measure('aa bb', f)).lines).toEqual(['aa bb', 'cc']);
    expect(wrap('aa\nbb', f, 1000).lines).toEqual(['aa', 'bb']);
    expect(wrap('Supercalifragilistic', f, 20).clipped).toBe(true);
  });

  it('truncates with an ellipsis, or to nothing', () => {
    const t = truncate('Hello world', f, measure('Hello…', f));
    expect(t).toBe('Hello…');
    expect(truncate('Hello', f, 1)).toBe('');
  });
});

describe('boxes (10.3)', () => {
  it('stretches children of a column and centres them in a row', () => {
    const e = els(
      'screen "A" #a\n  column #c\n    button "x" #b\n  row #r\n    button "x" #b2\n    h1 "Tall" #t\n',
    );
    expect(e.b?.width).toBe(e.c?.width);
    // phone? no: desktop with 6u padding.
    expect(e.c?.x).toBe(24);
    expect(e.c?.width).toBe(1280 - 48);
    // The 36 px button is centred against the 40 px heading.
    expect((e.b2?.y ?? 0) - (e.r?.y ?? 0)).toBe(2);
  });

  it('shares the remaining room among growing children and spacers', () => {
    const e = els(
      'screen "A" size=1000x500\n  row #r\n    button "a" #a\n    spacer #s\n    button "b" #b\n',
    );
    expect((e.b?.x ?? 0) + (e.b?.width ?? 0)).toBe(1000 - 24);
    expect(e.s?.width).toBeGreaterThan(0);
  });

  it('justifies between when nothing grows', () => {
    const e = els('screen "A" size=1000x500\n  row justify=between\n    badge "a" #a\n    badge "b" #b\n');
    expect(e.a?.x).toBe(24);
    expect((e.b?.x ?? 0) + (e.b?.width ?? 0)).toBe(1000 - 24);
  });

  it('places grid children in equal columns, with spans', () => {
    const e = els(
      'screen "A" size=1000x500\n  grid cols=3 #g\n    card #a\n    card #b span=2\n    card #c\n',
    );
    const g = e.g;
    expect(e.a?.x).toBe(g?.x);
    // 920 px shared in three: 306.5, 306.5 and 307 (the remainder). b spans the last two and a gap.
    expect(e.a?.width).toBe(306.5);
    expect(e.b?.width).toBe(306.5 + 16 + 307);
    expect(e.c?.y).toBeGreaterThan(e.a?.y ?? 0);
  });

  it('wraps a row onto new lines with the wrap flag', () => {
    const e = els(
      'screen "A" size=300x500\n  row wrap\n    button "First button" #a\n    button "Second button" #b\n',
    );
    expect(e.b?.y).toBeGreaterThan(e.a?.y ?? 0);
    expect(e.b?.x).toBe(e.a?.x);
  });

  it('pushes content down with a spacer in the screen body', () => {
    const e = els('screen "A" size=400x600\n  text "top" #t\n  spacer\n  button "bottom" #b\n');
    expect((e.b?.y ?? 0) + (e.b?.height ?? 0)).toBe(600 - 24);
  });

  it('grows the frame for tall content and keeps the footer at the bottom', () => {
    const L = layout(`screen "A" size=400x300\n  text lines=40\n  footer #f\n    text "end"\n`);
    const f = L.frames[0];
    expect(f?.height).toBeGreaterThan(300);
    const footer = f?.elements.find((x) => x.id === 'f');
    expect((footer?.y ?? 0) + (footer?.height ?? 0)).toBe(f?.height);
  });

  it('keeps badges and avatars at their own width in a stretched column', () => {
    const e = els('screen "A"\n  badge "New" #b\n');
    expect(e.b?.width).toBeGreaterThan(0);
  });
});
