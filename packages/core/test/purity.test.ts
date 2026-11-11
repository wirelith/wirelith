// SPDX-License-Identifier: MIT

// Core imports nothing: no packages, no Node built-ins, no network, no DOM, no clock.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = 'packages/core/src';
const files = readdirSync(dir, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.ts'));

describe('core purity', () => {
  it('has no dependencies of any kind', () => {
    const pkg = JSON.parse(readFileSync('packages/core/package.json', 'utf8'));
    for (const k of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
      'bundleDependencies',
      'bundledDependencies',
    ]) {
      expect(pkg[k] ?? {}, k).toEqual({});
    }
  });

  for (const f of files) {
    it(`${f} imports only core's own modules and touches no outside world`, () => {
      const raw = readFileSync(join(dir, f), 'utf8');
      // Comments are prose, not code: leave them out (but keep "//" inside URLs such as xmlns).
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const m of text.matchAll(/\b(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)) {
        expect(m[1], `${f}: ${m[0]}`).toMatch(/^\.\.?\//);
      }
      expect(text).not.toMatch(/\bimport\s*\(/);
      expect(text).not.toMatch(/\brequire\s*\(/);
      const uses = [
        /\bfetch\s*\(/,
        /\bXMLHttpRequest\b/,
        /\bWebSocket\b/,
        /\bdocument\s*\./,
        /\bwindow\s*\./,
        /\bglobalThis\b/,
        /\bprocess\s*\./,
        /\bnew\s+Date\b/,
        /\bDate\s*\.\s*now\b/,
        /\bMath\s*\.\s*random\b/,
        /\bperformance\s*\./,
        /\bsetTimeout\s*\(/,
        /\beval\s*\(/,
        /\bnew\s+Function\b/,
      ];
      for (const re of uses) expect(re.test(text), `${f} matches ${re}`).toBe(false);
    });
  }
});
