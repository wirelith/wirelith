// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { render } from '../../core/src/index.js';
import { addText, crc32, extractPngSource, readText, svgToPng } from '../src/index.js';

const source = 'screen "Sign in" phone\n  h1 "Welcome back"\n  button "Sign in" primary\n';

describe('chunks', () => {
  it('computes CRC-32 as PNG does', () => {
    // The check value of CRC-32 for "123456789".
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('adds and reads back UTF-8 text, replacing an earlier chunk with the same keyword', () => {
    const png = svgToPng(render(source).svg ?? '');
    const once = addText(png, 'wirelith-source', 'first');
    const twice = addText(once, 'wirelith-source', 'zweite Fassung: café 😀');
    expect(readText(twice, 'wirelith-source')).toBe('zweite Fassung: café 😀');
    expect(readText(twice, 'other')).toBeNull();
  });

  it('treats a PNG as untrusted', () => {
    expect(readText(new Uint8Array([1, 2, 3]), 'wirelith-source')).toBeNull();
    const png = addText(svgToPng(render(source).svg ?? ''), 'wirelith-source', 'x');
    // Cut it short in the middle of a chunk: no exception, just null or the text before the cut.
    expect(() => readText(png.subarray(0, 40), 'wirelith-source')).not.toThrow();
    expect(() => addText(new Uint8Array([0, 1, 2]), 'k', 'v')).toThrow();
  });
});

describe('svgToPng', () => {
  it('rasterises at a scale and embeds the source', () => {
    const svg = render(source).svg ?? '';
    const one = svgToPng(svg, { source });
    const two = svgToPng(svg, { source, scale: 2 });
    const width = (png: Uint8Array) => new DataView(png.buffer, png.byteOffset).getUint32(16);
    expect(width(one)).toBe(390);
    expect(width(two)).toBe(780);
    expect(extractPngSource(one)).toBe(source);
  });

  it('gives the same bytes every time', () => {
    const svg = render(source).svg ?? '';
    expect(Buffer.from(svgToPng(svg)).equals(Buffer.from(svgToPng(svg)))).toBe(true);
  });

  it('rejects an unreasonable scale', () => {
    expect(() =>
      svgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', { scale: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      svgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', { scale: 100 }),
    ).toThrow(RangeError);
  });
});
