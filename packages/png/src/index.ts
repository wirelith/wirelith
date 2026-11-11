// SPDX-License-Identifier: MIT

/**
 * @wirelith/png: rasterises Wirelith SVG to PNG with the bundled fonts, so the output doesn't
 * depend on the fonts installed on a machine, and carries the source in the PNG.
 */

import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { addText, readText } from './chunks.js';

export { addText, crc32, readText } from './chunks.js';

/** The iTXt keyword for an embedded source (spec section 12.3). */
export const SOURCE_KEYWORD = 'wirelith-source';

/** The fonts copied into the package at build time. */
const PACKAGED = fileURLToPath(new URL('../fonts/', import.meta.url));
/** In this repository, before a build: the same files where they are kept. */
const IN_REPOSITORY = fileURLToPath(new URL('../../../third-party/fonts/', import.meta.url));

let fontFiles: string[] | undefined;

function ttfFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...ttfFiles(join(dir, e.name)));
    else if (e.name.endsWith('.ttf')) out.push(join(dir, e.name));
  }
  return out;
}

/** The bundled font files. */
export function bundledFonts(): string[] {
  if (!fontFiles) {
    const dir = existsSync(PACKAGED) ? PACKAGED : IN_REPOSITORY;
    fontFiles = ttfFiles(dir).sort((a, b) => (basename(a) < basename(b) ? -1 : 1));
    if (fontFiles.length === 0) throw new Error('the bundled fonts are missing');
  }
  return fontFiles;
}

export interface PngOptions {
  /** Pixels per SVG pixel. Default 1. */
  scale?: number;
  /** The source to embed in an iTXt chunk, if any. */
  source?: string;
}

/** Rasterises an SVG to PNG bytes, with only the bundled fonts. */
export function svgToPng(svg: string, options: PngOptions = {}): Uint8Array {
  const scale = options.scale ?? 1;
  if (!(scale > 0 && scale <= 8)) throw new RangeError('scale must be greater than 0 and at most 8');
  const r = new Resvg(svg, {
    font: { fontFiles: bundledFonts(), loadSystemFonts: false, defaultFontFamily: 'Inter' },
    fitTo: { mode: 'zoom', value: scale },
    imageRendering: 0,
    shapeRendering: 2,
    textRendering: 1,
  });
  const png = new Uint8Array(r.render().asPng());
  return options.source === undefined ? png : addText(png, SOURCE_KEYWORD, options.source);
}

/** The source embedded in a PNG, or null. Treat it as untrusted. */
export function extractPngSource(png: Uint8Array): string | null {
  return readText(png, SOURCE_KEYWORD);
}
