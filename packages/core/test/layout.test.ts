// SPDX-License-Identifier: MIT

// Layout rules (spec sections 10 and 11) and number formatting (section 12.2).

import { describe, expect, it } from 'vitest';
import { layout, render } from '../src/index.js';
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

describe('overview (7.4)', () => {
  const frames = (src: string) => Object.fromEntries(layout(src).frames.map((f) => [f.id, f]));

  it('stacks a variant below its base, whichever is written first', () => {
    for (const src of [
      'screen "Base" #base\nscreen "Base" #v of=#base state="Empty"\nscreen "Next" #next\n',
      'screen "Base" #v of=#base state="Empty"\nscreen "Base" #base\nscreen "Next" #next\n',
    ]) {
      const f = frames(src);
      expect(f.v?.x, src).toBe(f.base?.x);
      expect(f.v?.y, src).toBe((f.base?.y ?? 0) + (f.base?.height ?? 0) + 64);
      expect(f.next?.x, src).toBe((f.base?.x ?? 0) + (f.base?.width ?? 0) + 96);
    }
  });

  it('wraps groups into bands so the canvas stays within 16,000 px', () => {
    const src = Array.from({ length: 50 }, (_, i) => `screen "S${i}" desktop #s${i}`).join('\n');
    const L = layout(src);
    expect(L.diagnostics).toEqual([]);
    expect(L.width).toBeLessThanOrEqual(16000);
    const f = Object.fromEntries(L.frames.map((x) => [x.id, x]));
    // Eleven desktop frames fit in a band: 32 + 11 x 1280 + 10 x 96 + 32 = 15,104.
    expect(f.s10?.y).toBe(f.s0?.y);
    expect(f.s11?.x).toBe(32);
    expect(f.s11?.y).toBe((f.s0?.y ?? 0) + 800 + 96);
    expect(f.s44?.y).toBe(f.s49?.y);
    expect(f.s44?.y).toBeGreaterThan(f.s43?.y ?? 0);
  });

  it('runs an arrow to another band in lanes above that band', () => {
    const screens = Array.from(
      { length: 13 },
      (_, i) => `screen "S${i}" desktop #s${i}${i === 0 ? '\n  button "Go" -> #s12' : ''}`,
    );
    const L = layout(screens.join('\n'));
    const f = Object.fromEntries(L.frames.map((x) => [x.id, x]));
    // One lane above band 2 pushes it down by 12 px; band 1 has none above it.
    expect(f.s0?.y).toBe(32 + 32);
    expect(f.s12?.y).toBe(64 + 800 + 96 + 12);
  });
});

describe('notes and arrows (7.4)', () => {
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  /** The box each notes list takes, from its frame and the baselines of its text. */
  const noteBoxes = (src: string): Rect[] => {
    const svg = render(src).svg ?? '';
    return layout(src).frames.flatMap((f) => {
      const g = svg.match(
        new RegExp(`<g id="wl-${f.id}-notes"[^>]*>(.*?)</g></g>|<g id="wl-${f.id}-notes"[^>]*>(.*?)</g>`),
      );
      if (!g) return [];
      const ys = [...(g[0] ?? '').matchAll(/<text x="[0-9.]+" y="([0-9.]+)"/g)].map((m) => Number(m[1]));
      // A line's top is 15 px above its baseline and its bottom 3 px below (18 px line).
      return [
        { x0: f.x, y0: Math.min(...ys) - 15, x1: f.x + Math.max(f.width, 240), y1: Math.max(...ys) + 3 },
      ];
    });
  };
  /** Every straight segment of every arrow. */
  const segments = (src: string): Rect[] => {
    const svg = render(src).svg ?? '';
    return [...svg.matchAll(/<path d="(M[^"]*)"[^>]*marker-end=/g)].flatMap((m) => {
      const pts = [...(m[1] ?? '').matchAll(/[ML]([0-9.]+) ([0-9.]+)/g)].map((p) => [
        Number(p[1]),
        Number(p[2]),
      ]);
      return pts.slice(1).map((b, i) => {
        const a = pts[i] as number[];
        return {
          x0: Math.min(a[0] ?? 0, b[0] ?? 0),
          y0: Math.min(a[1] ?? 0, b[1] ?? 0),
          x1: Math.max(a[0] ?? 0, b[0] ?? 0),
          y1: Math.max(a[1] ?? 0, b[1] ?? 0),
        };
      });
    });
  };
  const meet = (a: Rect, b: Rect) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

  /** Every frame's box, shrunk by 1 px so an arrow that ends on its edge doesn't count. */
  const frameBoxes = (src: string): Rect[] =>
    layout(src).frames.map((f) => ({
      x0: f.x + 1,
      y0: f.y + 1,
      x1: f.x + f.width - 1,
      y1: f.y + f.height - 1,
    }));
  /** Each arrow's start point and segments, in order. */
  const arrowsOf = (src: string): { start: number[]; segs: Rect[] }[] => {
    const svg = render(src).svg ?? '';
    return [...svg.matchAll(/<path d="(M[^"]*)"[^>]*marker-end=/g)].map((m) => {
      const pts = [...(m[1] ?? '').matchAll(/[ML]([0-9.]+) ([0-9.]+)/g)].map((p) => [
        Number(p[1]),
        Number(p[2]),
      ]);
      const segs = pts.slice(1).map((b, i) => {
        const a = pts[i] as number[];
        return {
          x0: Math.min(a[0] ?? 0, b[0] ?? 0),
          y0: Math.min(a[1] ?? 0, b[1] ?? 0),
          x1: Math.max(a[0] ?? 0, b[0] ?? 0),
          y1: Math.max(a[1] ?? 0, b[1] ?? 0),
        };
      });
      return { start: pts[0] ?? [0, 0], segs };
    });
  };

  /**
   * A source with screens of mixed sizes, variants, linked overlays, notes, links in both
   * directions, and flows.
   */
  const generate = (seed: number) => {
    let x = seed;
    // A small 32-bit generator, so every run makes the same sources.
    const rand = (n: number) => {
      x = (x + 0x6d2b79f5) | 0;
      let t = Math.imul(x ^ (x >>> 15), 1 | x);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) % n;
    };
    const count = 2 + rand(5);
    const lines: string[] = ['wirelith 0.1'];
    for (let i = 0; i < count; i++) {
      const device = ['phone', 'tablet', 'desktop', 'size=300x200'][rand(4)];
      const variant = i > 0 && rand(4) === 0 ? ` of=#s${rand(i)} state="Empty"` : '';
      lines.push(`screen "S${i}" ${device} #s${i}${variant}`);
      if (rand(3) === 0) {
        lines.push(
          `  button "Open" #o${i} -> #m${i}`,
          `  modal "Dialog ${i}" #m${i}`,
          `    button "Done" -> #s${rand(count)}`,
        );
      }
      for (let k = 0; k < 1 + rand(4); k++) {
        lines.push(`  button "Go ${k}" #b${i}x${k} -> #s${rand(count)} "Label ${k}"`);
      }
      for (let k = 0; k < rand(4); k++) {
        const target = rand(2) === 0 ? ` for=#b${i}x0` : '';
        lines.push(
          `  note "${'Something worth knowing about this screen. '.repeat(1 + rand(3)).trim()}"${target}`,
        );
      }
    }
    for (let k = 0; k < rand(3); k++) lines.push(`flow #s${rand(count)} -> #s${rand(count)} "Flow ${k}"`);
    return `${lines.join('\n')}\n`;
  };

  it('never draws an arrow through a notes list', () => {
    const readme = [
      'screen "Sign in" phone #signin',
      '  link "Forgot password?" -> #reset',
      '  button "Sign in" primary -> #home',
      '  note "Disabled until both fields are filled in" for=#signin',
      'screen "Reset password" phone #reset',
      '  button "Send link" primary -> #signin "Back to sign in"',
      'screen "Home" phone #home',
      '',
    ].join('\n');
    let checked = 0;
    for (const src of [readme, ...Array.from({ length: 300 }, (_, i) => generate(i + 1))]) {
      const notes = noteBoxes(src);
      const segs = segments(src);
      checked += notes.length;
      for (const n of notes) for (const s of segs) expect(meet(n, s), src).toBe(false);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('never draws an arrow through a frame other than the one it leaves', () => {
    let arrows = 0;
    for (const src of Array.from({ length: 300 }, (_, i) => generate(i + 1))) {
      const boxes = frameBoxes(src);
      for (const { start, segs } of arrowsOf(src)) {
        arrows++;
        const [sx = 0, sy = 0] = start;
        // The first segment starts inside the frame it leaves, and may cross it.
        const own = boxes.filter((b) => b.x0 <= sx && sx <= b.x1 && b.y0 <= sy && sy <= b.y1);
        segs.forEach((seg, i) => {
          for (const b of boxes) {
            if (i === 0 && own.includes(b)) continue;
            expect(meet(b, seg), src).toBe(false);
          }
        });
      }
    }
    expect(arrows).toBeGreaterThan(1000);
  });

  it('puts the notes list 24 px below its frame, as wide as the frame or 240 px', () => {
    const src = 'screen "A" size=300x200 #a\n  note "One"\nscreen "B" size=100x100 #b\n  note "Two"\n';
    const f = Object.fromEntries(layout(src).frames.map((x) => [x.id, x]));
    const svg = render(src).svg ?? '';
    // The heading's baseline is 15 px below the list's top.
    expect(svg).toContain(`<text x="${f.a?.x}" y="${(f.a?.y ?? 0) + 200 + 24 + 15}"`);
    // B is narrower than 240 px, so the list makes its group 240 px wide.
    expect(f.b?.x).toBe((f.a?.x ?? 0) + 300 + 96);
    expect(layout(src).width).toBe((f.b?.x ?? 0) + 240 + 32);
  });
});

describe('arrow spacing across bands (10.6)', () => {
  /** The x of each arrow's vertical run, in drawing order. */
  const runs = (src: string) => {
    const svg = render(src).svg ?? '';
    // Arrow paths only: they end in the arrowhead marker.
    return [...svg.matchAll(/<path d="M[0-9.]+ [0-9.]+L([0-9.]+) [^"]*"[^>]*marker-end=/g)].map((m) =>
      Number(m[1]),
    );
  };

  it('spaces arrows in one band independently of arrows in another', () => {
    // Band 1 holds s0..s10; band 2 holds s11 and s12. The gap right of s0 and the gap right of
    // s11 have the same x-range but are different gaps.
    const screens = (extra: string) =>
      Array.from(
        { length: 13 },
        (_, i) =>
          `screen "S${i}" desktop #s${i}${i === 0 ? '\n  button "A" -> #s1' : ''}${i === 11 ? extra : ''}`,
      ).join('\n');
    const alone = runs(screens(''));
    const withOther = runs(screens('\n  button "B" -> #s12'));
    // The arrow from s0 to s1 runs at the same x whether or not band 2 has an arrow too.
    expect(alone).toEqual([1360]);
    expect(withOther[0]).toBe(1360);
  });
});

describe('image (10.4)', () => {
  it('uses a fixed height as the height, without a warning', () => {
    const L = layout('screen "A"\n  image "Fixed" width=100 height=60 #i\n');
    expect(L.diagnostics).toEqual([]);
    expect(L.frames[0]?.elements.find((e) => e.id === 'i')?.height).toBe(60);
  });
});
