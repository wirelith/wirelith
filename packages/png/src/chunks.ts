// SPDX-License-Identifier: MIT

// Reading and writing PNG text chunks (iTXt), for the source a PNG carries (spec section 12.3).

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let table: Uint32Array | undefined;

/** CRC-32 as PNG uses it. */
export function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = (table[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function isPng(png: Uint8Array): boolean {
  return png.length >= 8 && SIGNATURE.every((b, i) => png[i] === b);
}

interface Chunk {
  type: string;
  start: number;
  data: Uint8Array;
}

/** The chunks of a PNG. Stops at the first malformed chunk. */
function chunks(png: Uint8Array): Chunk[] {
  const out: Chunk[] = [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let i = 8;
  while (i + 12 <= png.length) {
    const len = view.getUint32(i);
    if (i + 12 + len > png.length) break;
    const type = String.fromCharCode(...png.subarray(i + 4, i + 8));
    out.push({ type, start: i, data: png.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Adds an uncompressed iTXt chunk, with empty language and translated-keyword fields, right
 * after the IHDR chunk. Any existing iTXt chunks with the same keyword are dropped.
 */
export function addText(png: Uint8Array, keyword: string, text: string): Uint8Array {
  if (!isPng(png)) throw new Error('not a PNG');
  if (!/^[\x20-\x7e]{1,79}$/.test(keyword))
    throw new Error('a PNG keyword is 1 to 79 printable ASCII characters');
  const all = chunks(png);
  const ihdr = all[0];
  if (ihdr?.type !== 'IHDR') throw new Error('a PNG starts with IHDR');
  const body = new Uint8Array([...encoder.encode(keyword), 0, 0, 0, 0, 0, ...encoder.encode(text)]);
  const chunk = new Uint8Array(12 + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length);
  chunk.set(encoder.encode('iTXt'), 4);
  chunk.set(body, 8);
  view.setUint32(8 + body.length, crc32(chunk.subarray(4, 8 + body.length)));
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  for (const c of all) {
    const whole = png.subarray(c.start, c.start + 12 + c.data.length);
    if (c.type === 'iTXt' && readKeyword(c.data) === keyword) continue;
    parts.push(whole);
    if (c.type === 'IHDR') parts.push(chunk);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function readKeyword(data: Uint8Array): string {
  const end = data.indexOf(0);
  return end < 0 ? '' : String.fromCharCode(...data.subarray(0, end));
}

/**
 * Reads the text of the first uncompressed iTXt chunk with this keyword, or null. The PNG is
 * untrusted: malformed chunks and text that isn't UTF-8 give null.
 */
export function readText(png: Uint8Array, keyword: string): string | null {
  if (!isPng(png)) return null;
  for (const c of chunks(png)) {
    if (c.type !== 'iTXt' || readKeyword(c.data) !== keyword) continue;
    const d = c.data;
    let i = keyword.length + 1;
    const compressed = d[i];
    i += 2; // compression flag and method
    if (compressed !== 0) return null;
    const lang = d.indexOf(0, i);
    if (lang < 0) return null;
    const translated = d.indexOf(0, lang + 1);
    if (translated < 0) return null;
    try {
      return decoder.decode(d.subarray(translated + 1));
    } catch {
      return null;
    }
  }
  return null;
}
