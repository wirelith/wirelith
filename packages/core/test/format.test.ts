// SPDX-License-Identifier: MIT

// The formatter never changes what a source means, is idempotent, and keeps every comment.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { format, parse } from '../src/index.js';

/** The tree without positions. */
const shape = (src: string) =>
  JSON.parse(JSON.stringify(parse(src).tree, (k, v) => (k === 'loc' ? undefined : v)));

const cases = readdirSync('conformance/cases').map((name) => ({
  name,
  source: readFileSync(join('conformance/cases', name, 'input.wirelith'), 'utf8'),
}));

describe('format', () => {
  it('writes the canonical form', () => {
    const src = [
      '// Leading comment',
      'screen  #home  "Home"   phone // trailing',
      '   // odd comment indent',
      '  button primary "Go" -> #home "Back"',
      '',
      '',
      '  select value="1" [a,"b, c", "#1", " d "] "Pick"',
      '  input placeholder="Search" type=search grow width=50%',
      'theme "x" extends=ink',
      '  radius   10 // round',
      'flow #home -> #home "Loop"',
      '',
    ].join('\n');
    expect(format(src)).toBe(
      [
        'wirelith 0.1',
        '',
        '// Leading comment',
        'screen "Home" phone #home // trailing',
        '  // odd comment indent',
        '  button "Go" primary -> #home "Back"',
        '',
        '  select "Pick" [a, "b, c", "#1", " d "] value="1"',
        '  input grow placeholder=Search type=search width=50%',
        'theme "x" extends=ink',
        '  radius 10 // round',
        'flow #home -> #home "Loop"',
        '',
      ].join('\n'),
    );
  });

  it('refuses a source with syntax errors', () => {
    expect(format('screen "A\n')).toBeNull();
    expect(format('screen "A"\n  textfield\n')).toBeNull();
  });

  for (const { name, source } of cases) {
    if (parse(source).diagnostics.some((d) => d.severity === 'error')) continue;
    it(`${name}: keeps the meaning, is idempotent, keeps comments`, () => {
      const once = format(source);
      expect(once).not.toBeNull();
      expect(shape(once ?? '')).toEqual(shape(source));
      expect(format(once ?? '')).toBe(once);
      const comments = (s: string) => (s.match(/\/\/[^\n]*/g) ?? []).map((c) => c.trim());
      for (const c of comments(source.replace(/"(?:[^"\\]|\\.)*"/g, '""'))) expect(once).toContain(c);
    });
  }
});
