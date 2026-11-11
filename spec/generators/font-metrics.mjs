// SPDX-License-Identifier: MIT

// Generates the font-metrics tables in spec/data/fonts from the pinned font files.
//
//   node spec/generators/font-metrics.mjs           write the tables
//   node spec/generators/font-metrics.mjs --check   fail if the committed tables are out of date
//
// For each allowlisted font and each weight the spec uses, the table holds the font's units
// per em, its hhea ascent and descent, the `default` advance (the advance of glyph 0, the
// .notdef box drawn for a missing character), and the advance of every character the font
// maps in the covered ranges. All values are in font units.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFont } from './lib/truetype.mjs';

/** Code point ranges covered by the tables, inclusive. @type {[number, number][]} */
export const RANGES = [
  [0x0020, 0x024f], // Basic Latin, Latin-1 Supplement, Latin Extended-A and -B
  [0x2000, 0x206f], // General Punctuation
  [0x20a0, 0x20cf], // Currency Symbols
  [0x2190, 0x21ff], // Arrows
];

const OUT = 'spec/data/fonts';
const lock = JSON.parse(readFileSync('spec/generators/inputs.lock.json', 'utf8'));

/** @param {string} path */
function pinned(path) {
  const bytes = readFileSync(path);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (lock.files[path] !== actual) throw new Error(`${path} does not match its pinned SHA-256`);
  return bytes;
}

/**
 * @param {string} name allowlist name: sans, serif or mono
 * @param {any} spec its entry in the lock file
 * @param {string} weight
 */
function table(name, spec, weight) {
  const file = spec.weights[weight];
  const font = readFont(new Uint8Array(pinned(join(spec.dir, file))));
  /** @type {Record<string, number>} */
  const advances = {};
  for (const [lo, hi] of RANGES) {
    for (let cp = lo; cp <= hi; cp++) {
      const glyph = font.glyphOf(cp);
      if (glyph !== 0) advances[String.fromCodePoint(cp)] = font.advance(glyph);
    }
  }
  return {
    font: name,
    family: spec.family,
    version: spec.version,
    weight: Number(weight),
    file,
    unitsPerEm: font.unitsPerEm,
    ascent: font.ascent,
    descent: font.descent,
    default: font.advance(0),
    advances,
  };
}

const check = process.argv.includes('--check');
let stale = 0;
mkdirSync(OUT, { recursive: true });
for (const [name, spec] of Object.entries(lock.fonts)) {
  for (const weight of Object.keys(spec.weights)) {
    const path = join(OUT, `${name}-${weight}.json`);
    const text = `${JSON.stringify(table(name, spec, weight), null, 1)}\n`;
    if (check) {
      let current = '';
      try {
        current = readFileSync(path, 'utf8');
      } catch {}
      if (current !== text) {
        console.error(`${path} is out of date; run node spec/generators/font-metrics.mjs`);
        stale++;
      }
    } else {
      writeFileSync(path, text);
    }
  }
}
if (stale > 0) process.exit(1);
console.log(check ? 'font metrics: up to date.' : `font metrics: written to ${OUT}.`);
