// SPDX-License-Identifier: MIT

// Generates spec/data/icons.json, the icon set for this spec version, from the pinned
// lucide-static package and the curated list in icons.txt.
//
//   node spec/generators/icons.mjs           write the data
//   node spec/generators/icons.mjs --check   fail if the committed data is out of date
//
// It refuses any icon whose Lucide metadata puts it in a brands category or deprecates it as a
// brand. It converts polyline, polygon and ellipse, which the SVG allowlist doesn't include,
// into equivalent path data. Coordinates are copied as written in the source data.

import { readFileSync, writeFileSync } from 'node:fs';
import { checkVersion, iconNodes, resolveNames, wantedNames } from './lib/lucide.mjs';

const OUT = 'spec/data/icons.json';
const lock = JSON.parse(readFileSync('spec/generators/inputs.lock.json', 'utf8'));
const meta = JSON.parse(readFileSync('spec/generators/lucide-metadata.json', 'utf8'));
checkVersion(lock.icons.version);
if (meta.commit !== lock.icons.commit) throw new Error('lucide-metadata.json is for another commit');

/** Attributes kept for each element, in output order. */
const ATTRS = {
  path: ['d'],
  circle: ['cx', 'cy', 'r', 'fill'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
};

/** @param {number} n */
const num = (n) => String(Math.round(n * 1000) / 1000);

/**
 * Converts one Lucide node into nodes the SVG allowlist permits.
 * @param {string} tag
 * @param {Record<string, string>} a
 * @returns {[string, Record<string, string>]}
 */
export function convert(tag, a) {
  if (tag === 'polyline' || tag === 'polygon') {
    const n = (a.points ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (n.length < 4 || n.length % 2 !== 0 || n.some((v) => !Number.isFinite(v))) {
      throw new Error(`bad points "${a.points}"`);
    }
    let d = `M${num(n[0] ?? 0)} ${num(n[1] ?? 0)}`;
    for (let i = 2; i < n.length; i += 2) d += `L${num(n[i] ?? 0)} ${num(n[i + 1] ?? 0)}`;
    return ['path', { d: tag === 'polygon' ? `${d}Z` : d }];
  }
  if (tag === 'ellipse') {
    const [cx, cy, rx, ry] = [a.cx, a.cy, a.rx, a.ry].map(Number);
    if (![cx, cy, rx, ry].every((v) => Number.isFinite(v))) throw new Error('bad ellipse');
    const r = `${num(rx ?? 0)} ${num(ry ?? 0)}`;
    const d = `M${num((cx ?? 0) - (rx ?? 0))} ${num(cy ?? 0)}a${r} 0 1 0 ${num(2 * (rx ?? 0))} 0a${r} 0 1 0 ${num(-2 * (rx ?? 0))} 0Z`;
    return ['path', { d }];
  }
  const keep = /** @type {Record<string, string[]>} */ (ATTRS)[tag];
  if (!keep) throw new Error(`unsupported element <${tag}>`);
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of keep) if (a[k] !== undefined) out[k] = String(a[k]);
  for (const k of Object.keys(a)) {
    if (!keep.includes(k)) throw new Error(`unexpected attribute ${k} on <${tag}>`);
  }
  if (out.fill !== undefined && out.fill !== 'currentColor' && out.fill !== 'none') {
    throw new Error(`unexpected fill "${out.fill}"`);
  }
  return [tag, out];
}

/**
 * Why an icon may not be included, or null when it may. Brand and logo icons are never
 * included, whatever the release says about them.
 * @param {{ categories: string[], deprecated?: boolean, deprecationReason?: string } | undefined} m
 * @returns {string | null}
 */
export function iconProblem(m) {
  if (!m) return 'it has no metadata; run fetch-lucide-metadata.mjs';
  const reason = String(m.deprecationReason ?? '').toLowerCase();
  if (m.categories.some((c) => /brand|logo/i.test(c)) || /brand|logo/.test(reason)) {
    return 'it is a brand or logo icon, which Wirelith never includes';
  }
  if (m.deprecated) return 'it is deprecated in the pinned release';
  return null;
}

/** @param {string} canonical */
function refuseBrands(canonical) {
  const problem = iconProblem(meta.icons[canonical]);
  if (problem) throw new Error(`${canonical}: ${problem}`);
}

function build() {
  const names = wantedNames();
  const resolved = resolveNames(names);
  const nodes = iconNodes();
  /** @type {Record<string, string>} */
  const nameMap = {};
  /** @type {Record<string, [string, Record<string, string>][]>} */
  const drawings = {};
  for (const name of [...names].sort()) {
    const canonical = resolved.get(name) ?? name;
    refuseBrands(canonical);
    nameMap[name] = canonical;
    drawings[canonical] ??= (nodes[canonical] ?? []).map(([t, a]) => convert(t, a));
  }
  const sortedDrawings = Object.fromEntries(
    Object.keys(drawings)
      .sort()
      .map((k) => [k, drawings[k]]),
  );
  return {
    set: lock.icons.set,
    version: lock.icons.version,
    license: lock.icons.license,
    viewBox: [0, 0, 24, 24],
    strokeWidth: 2,
    names: nameMap,
    drawings: sortedDrawings,
  };
}

const isMain = process.argv[1]?.endsWith('icons.mjs');
if (isMain) {
  const text = `${JSON.stringify(build(), null, 1)}\n`;
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT, 'utf8');
    } catch {}
    if (current !== text) {
      console.error(`${OUT} is out of date; run node spec/generators/icons.mjs`);
      process.exit(1);
    }
    console.log('icons: up to date.');
  } else {
    writeFileSync(OUT, text);
    console.log(`icons: written to ${OUT}.`);
  }
}
