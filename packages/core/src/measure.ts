// SPDX-License-Identifier: MIT

// Text measurement (spec section 11) with the metrics tables that ship with the spec.

import { FONT_TABLES } from './data/fonts.js';
import type { FontName } from './theme.js';

interface Table {
  upm: number;
  ascent: number;
  def: number;
  adv: Map<number, number>;
}

const cache = new Map<string, Table>();

function table(font: FontName, weight: number): Table {
  const key = `${font}-${weight}`;
  let t = cache.get(key);
  if (t) return t;
  const raw = FONT_TABLES[key];
  if (!raw) throw new Error(`no metrics for ${key}`);
  const [upm, ascent, , def, encoded] = raw;
  const adv = new Map<number, number>();
  for (const pair of encoded.split(' ')) {
    if (pair === '') continue;
    const [cp, a] = pair.split(':');
    adv.set(Number.parseInt(cp ?? '', 36), Number.parseInt(a ?? '', 36));
  }
  t = { upm, ascent, def, adv };
  cache.set(key, t);
  return t;
}

/** Rounds to the nearest 0.5, halves up (spec section 10.1). */
export function r(x: number): number {
  return Math.floor(2 * x + 0.5) / 2;
}

export interface Font {
  font: FontName;
  weight: number;
  size: number;
}

/** The width of a string on one line, in font units. */
function units(text: string, t: Table): number {
  let sum = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp > 0xffff) sum += 2 * t.def;
    else sum += t.adv.get(cp) ?? t.def;
  }
  return sum;
}

/** The width of a string on one line, in pixels, rounded. */
export function measure(text: string, f: Font): number {
  const t = table(f.font, f.weight);
  return r((units(text, t) * f.size) / t.upm);
}

/** The ascent of a font at a size, in pixels (not rounded). */
export function ascent(f: Font): number {
  const t = table(f.font, f.weight);
  return (t.ascent * f.size) / t.upm;
}

/** The baseline offset from the top of a line box (spec section 11), rounded. */
export function baseline(f: Font, lineHeight: number): number {
  return r((lineHeight - f.size) / 2 + ascent(f));
}

export interface Wrapped {
  lines: string[];
  /** True when a word was wider than the line and had to be clipped. */
  clipped: boolean;
}

/** Wraps text greedily at spaces and line breaks (spec section 11). */
export function wrap(text: string, f: Font, width: number): Wrapped {
  const lines: string[] = [];
  let clipped = false;
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (line === '' || measure(candidate, f) <= width) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
      if (measure(word, f) > width) clipped = true;
    }
    lines.push(line);
  }
  return { lines, clipped };
}

/** Cuts text to fit a width, ending it with "…" (spec section 11). */
export function truncate(text: string, f: Font, width: number): string {
  const one = text.replace(/\n/g, ' ');
  if (measure(one, f) <= width) return one;
  const chars = Array.from(one);
  for (let n = chars.length - 1; n >= 0; n--) {
    const s = `${chars.slice(0, n).join('')}…`;
    if (measure(s, f) <= width) return s;
  }
  return '';
}

/** The width of the widest word, for a text's minimum width. */
export function longestWord(text: string, f: Font): number {
  let w = 0;
  for (const word of text.split(/[ \n]/)) w = Math.max(w, measure(word, f));
  return w;
}

/** The width of the widest line when the text is not wrapped. */
export function lineWidth(text: string, f: Font): number {
  let w = 0;
  for (const line of text.split('\n')) w = Math.max(w, measure(line, f));
  return w;
}
