// SPDX-License-Identifier: MIT

// Reads the pinned lucide-static package: icon geometry, and the canonical icon behind each
// alias. An alias's SVG file is the same drawing as its canonical icon under another name.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'node_modules/lucide-static';

/** Checks that the installed package is the pinned version. */
export function checkVersion(/** @type {string} */ pinned) {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  if (version !== pinned) throw new Error(`lucide-static is ${version}; ${pinned} is pinned`);
}

/** @returns {Record<string, [string, Record<string, string>][]>} canonical name -> nodes */
export function iconNodes() {
  return JSON.parse(readFileSync(join(ROOT, 'icon-nodes.json'), 'utf8'));
}

/** The drawing in an SVG file, without its comment, class and whitespace. */
function drawing(/** @type {string} */ name) {
  return readFileSync(join(ROOT, 'icons', `${name}.svg`), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/class="[^"]*"/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps each requested name to its canonical icon name.
 * @param {string[]} names
 * @returns {Map<string, string>}
 */
export function resolveNames(names) {
  const nodes = iconNodes();
  const files = new Set(
    readdirSync(join(ROOT, 'icons'))
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.slice(0, -4)),
  );
  /** @type {Map<string, string> | undefined} drawing -> canonical name, built on first need */
  let byDrawing;
  const out = new Map();
  for (const name of names) {
    if (nodes[name]) {
      out.set(name, name);
      continue;
    }
    if (!files.has(name)) throw new Error(`no Lucide icon or alias is called "${name}"`);
    if (!byDrawing) {
      byDrawing = new Map();
      for (const canonical of Object.keys(nodes)) byDrawing.set(drawing(canonical), canonical);
    }
    const canonical = byDrawing.get(drawing(name));
    if (!canonical) throw new Error(`cannot find the icon that "${name}" is an alias of`);
    out.set(name, canonical);
  }
  return out;
}

/** The names listed in spec/generators/icons.txt. */
export function wantedNames() {
  return readFileSync('spec/generators/icons.txt', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}
