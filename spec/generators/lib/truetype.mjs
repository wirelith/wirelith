// SPDX-License-Identifier: MIT

// Reads the few TrueType tables the font-metrics generator needs: head, hhea, hmtx and cmap
// (formats 4 and 12). It is used only at generation time, on the pinned font files.

/**
 * @typedef {object} FontInfo
 * @property {number} unitsPerEm
 * @property {number} ascent  hhea ascender, in font units
 * @property {number} descent hhea descender, in font units (negative)
 * @property {(glyph: number) => number} advance advance width of a glyph, in font units
 * @property {(codePoint: number) => number} glyphOf glyph index for a code point; 0 when unmapped
 * @property {string} family the font's family name (name ID 1)
 * @property {string} subfamily the font's subfamily name (name ID 2)
 * @property {number} weightClass OS/2 usWeightClass
 */

/**
 * @param {Uint8Array} bytes
 * @returns {FontInfo}
 */
export function readFont(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  /** @type {Map<string, number>} */
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(rec),
      view.getUint8(rec + 1),
      view.getUint8(rec + 2),
      view.getUint8(rec + 3),
    );
    tables.set(tag, view.getUint32(rec + 8));
  }
  /** @param {string} tag */
  const table = (tag) => {
    const off = tables.get(tag);
    if (off === undefined) throw new Error(`font has no ${tag} table`);
    return off;
  };

  const head = table('head');
  const unitsPerEm = view.getUint16(head + 18);

  const hhea = table('hhea');
  const ascent = view.getInt16(hhea + 4);
  const descent = view.getInt16(hhea + 6);
  const numberOfHMetrics = view.getUint16(hhea + 34);

  const hmtx = table('hmtx');
  /** @param {number} glyph */
  const advance = (glyph) => {
    const g = Math.min(glyph, numberOfHMetrics - 1);
    return view.getUint16(hmtx + g * 4);
  };

  const os2 = table('OS/2');
  const weightClass = view.getUint16(os2 + 4);

  const glyphOf = readCmap(view, table('cmap'));
  const names = readNames(view, table('name'));

  return {
    unitsPerEm,
    ascent,
    descent,
    advance,
    glyphOf,
    family: names.get(16) ?? names.get(1) ?? '',
    subfamily: names.get(17) ?? names.get(2) ?? '',
    weightClass,
  };
}

/**
 * @param {DataView} view
 * @param {number} cmap
 * @returns {(cp: number) => number}
 */
function readCmap(view, cmap) {
  const n = view.getUint16(cmap + 2);
  /** @type {{ format: number, offset: number }[]} */
  const subtables = [];
  for (let i = 0; i < n; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const offset = cmap + view.getUint32(rec + 4);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (unicode) subtables.push({ format: view.getUint16(offset), offset });
  }
  const f12 = subtables.find((s) => s.format === 12);
  if (f12) return format12(view, f12.offset);
  const f4 = subtables.find((s) => s.format === 4);
  if (f4) return format4(view, f4.offset);
  throw new Error('font has no Unicode cmap of format 4 or 12');
}

/**
 * @param {DataView} view
 * @param {number} off
 */
function format12(view, off) {
  const groups = view.getUint32(off + 12);
  return (/** @type {number} */ cp) => {
    let lo = 0;
    let hi = groups - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const g = off + 16 + mid * 12;
      const start = view.getUint32(g);
      const end = view.getUint32(g + 4);
      if (cp < start) hi = mid - 1;
      else if (cp > end) lo = mid + 1;
      else return view.getUint32(g + 8) + (cp - start);
    }
    return 0;
  };
}

/**
 * @param {DataView} view
 * @param {number} off
 */
function format4(view, off) {
  const segX2 = view.getUint16(off + 6);
  const ends = off + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  return (/** @type {number} */ cp) => {
    if (cp > 0xffff) return 0;
    for (let i = 0; i < segX2; i += 2) {
      const end = view.getUint16(ends + i);
      if (cp > end) continue;
      const start = view.getUint16(starts + i);
      if (cp < start) return 0;
      const delta = view.getInt16(deltas + i);
      const rangeOffset = view.getUint16(ranges + i);
      if (rangeOffset === 0) return (cp + delta) & 0xffff;
      const g = view.getUint16(ranges + i + rangeOffset + (cp - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
}

/**
 * Reads Windows Unicode English names.
 * @param {DataView} view
 * @param {number} off
 * @returns {Map<number, string>}
 */
function readNames(view, off) {
  const count = view.getUint16(off + 2);
  const strings = off + view.getUint16(off + 4);
  /** @type {Map<number, string>} */
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const rec = off + 6 + i * 12;
    const platform = view.getUint16(rec);
    const language = view.getUint16(rec + 4);
    const nameId = view.getUint16(rec + 6);
    const length = view.getUint16(rec + 8);
    const start = strings + view.getUint16(rec + 10);
    if (platform !== 3 || language !== 0x409 || out.has(nameId)) continue;
    let s = '';
    for (let j = 0; j < length; j += 2) s += String.fromCharCode(view.getUint16(start + j));
    out.set(nameId, s);
  }
  return out;
}
