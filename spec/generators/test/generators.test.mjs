// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convert, iconProblem } from '../icons.mjs';

const icons = JSON.parse(readFileSync('spec/data/icons.json', 'utf8'));
const meta = JSON.parse(readFileSync('spec/generators/lucide-metadata.json', 'utf8'));

describe('icon conversion', () => {
  it('turns a polyline into an open path and a polygon into a closed one', () => {
    expect(convert('polyline', { points: '22 12 16 12 14 15' })).toEqual([
      'path',
      { d: 'M22 12L16 12L14 15' },
    ]);
    expect(convert('polygon', { points: '3,11 22,2 13,21' })).toEqual(['path', { d: 'M3 11L22 2L13 21Z' }]);
  });

  it('turns an ellipse into two arcs', () => {
    expect(convert('ellipse', { cx: '12', cy: '5', rx: '9', ry: '3' })).toEqual([
      'path',
      { d: 'M3 5a9 3 0 1 0 18 0a9 3 0 1 0 -18 0Z' },
    ]);
  });

  it('keeps allowed attributes in a fixed order and rejects others', () => {
    expect(convert('rect', { rx: '2', width: '18', x: '3', y: '4', height: '16' })).toEqual([
      'rect',
      { x: '3', y: '4', width: '18', height: '16', rx: '2' },
    ]);
    expect(() => convert('path', { d: 'M0 0', onclick: 'x' })).toThrow();
    expect(() => convert('image', { href: 'x' })).toThrow();
    expect(() => convert('circle', { cx: '1', cy: '1', r: '1', fill: 'red' })).toThrow();
  });
});

describe('brand guard', () => {
  it('refuses brand and logo icons however they are marked', () => {
    expect(iconProblem({ categories: ['brands'] })).toMatch(/brand/);
    expect(iconProblem({ categories: ['social', 'Logos'] })).toMatch(/brand/);
    expect(iconProblem({ categories: [], deprecated: true, deprecationReason: 'icon.brand' })).toMatch(
      /brand/,
    );
    expect(iconProblem({ categories: ['arrows'], deprecated: true })).toMatch(/deprecated/);
    expect(iconProblem(undefined)).toMatch(/metadata/);
    expect(iconProblem({ categories: ['arrows'] })).toBeNull();
  });
});

describe('spec/data/icons.json', () => {
  it('maps every name to a drawing, and draws only allowlisted shapes', () => {
    /** @type {Record<string, string[]>} */
    const allowed = {
      path: ['d'],
      circle: ['cx', 'cy', 'r', 'fill'],
      rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
      line: ['x1', 'y1', 'x2', 'y2'],
    };
    for (const [name, canonical] of Object.entries(icons.names)) {
      expect(icons.drawings[canonical], name).toBeDefined();
    }
    for (const nodes of Object.values(icons.drawings)) {
      for (const [tag, attrs] of nodes) {
        expect(Object.keys(allowed)).toContain(tag);
        for (const k of Object.keys(attrs)) expect(allowed[tag] ?? []).toContain(k);
      }
    }
  });

  it('includes no icon that its metadata marks as a brand, a logo or deprecated', () => {
    for (const canonical of Object.keys(icons.drawings)) {
      expect(iconProblem(meta.icons[canonical]), canonical).toBeNull();
    }
  });

  it('includes every icon name the specification and the AI spec use', () => {
    const used = [
      'search',
      'menu',
      'plus',
      'x',
      'user',
      'settings',
      'bell',
      'arrow-left',
      'chevron-right',
      'download',
      'trash',
      'pencil',
      'calendar',
      'shopping-cart',
      'check',
      'filter',
      'bold',
      'italic',
      'list',
      'link',
    ];
    for (const n of used) expect(icons.names[n], n).toBeDefined();
  });
});

describe('spec/data/fonts', () => {
  const tables = readdirSync('spec/data/fonts').map((f) =>
    JSON.parse(readFileSync(`spec/data/fonts/${f}`, 'utf8')),
  );

  it('has a table for each allowlisted font at each weight the spec uses', () => {
    const keys = tables.map((t) => `${t.font}-${t.weight}`).sort();
    expect(keys).toEqual([
      'mono-400',
      'mono-500',
      'mono-600',
      'mono-700',
      'sans-400',
      'sans-500',
      'sans-600',
      'sans-700',
      'serif-400',
      'serif-500',
      'serif-600',
      'serif-700',
    ]);
  });

  it('every table is complete and plausible', () => {
    for (const t of tables) {
      expect(t.unitsPerEm).toBeGreaterThan(0);
      expect(t.ascent).toBeGreaterThan(0);
      expect(t.descent).toBeLessThan(0);
      expect(t.default).toBeGreaterThan(0);
      for (const c of 'abcxyzABCXYZ0123456789 .,!?…')
        expect(t.advances[c], `${t.font}-${t.weight} "${c}"`).toBeGreaterThan(0);
      for (const v of Object.values(t.advances)) expect(Number.isInteger(v) && v >= 0).toBe(true);
    }
  });

  it('serif at weight 500 uses the Regular file, which is what font matching selects', () => {
    const s400 = tables.find((t) => t.font === 'serif' && t.weight === 400);
    const s500 = tables.find((t) => t.font === 'serif' && t.weight === 500);
    expect(s500.file).toBe(s400.file);
    expect(s500.advances).toEqual(s400.advances);
  });
});
