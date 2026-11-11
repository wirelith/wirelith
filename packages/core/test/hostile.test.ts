// SPDX-License-Identifier: MIT

// Hostile input in every string position must come out as escaped text, never as markup, script
// or a URL, and the output must still pass the strict checker.

import { describe, expect, it } from 'vitest';
import { extractSource, render, validate } from '../src/index.js';
import { checkSvg } from './svg-check.js';

const PAYLOADS = [
  '</text><script>alert(1)</script>',
  '"><foreignObject><iframe src="https://example.com/x"></iframe></foreignObject>',
  "' onload='alert(1)",
  'javascript:alert(1)',
  'url(https://example.com/tracker.png)',
  '<image href="https://example.com/x.png"/>',
  ']]><!-- --><?xml version="1.0"?>',
  '&amp; &lt;b&gt; &#60;script&#62; &unknown;',
  '<style>*{fill:red}</style>',
  '‮evil‬ zero​width \u{1F600} 漢字',
];

/** Escapes a payload so it can sit inside a Wirelith string. */
const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** A source that puts the payload in every place a source can put text. */
function everywhere(p: string): string {
  const s = q(p);
  // List items cannot hold an unescaped quote unquoted, so they are quoted too.
  const item = q(p);
  return [
    'wirelith 0.1',
    `theme ${s} extends=paper`,
    `  color.primary ${p.replace(/\s/g, '')}`,
    '',
    `screen ${s} #one`,
    '  header',
    `    h2 ${s}`,
    `    nav [${item}, Home] active=${s}`,
    `  h1 ${s} -> #two ${s}`,
    `  text ${s}`,
    `  label ${s}`,
    `  link ${s}`,
    `  button ${s} icon=${s}`,
    `  input ${s} placeholder=${s} value=${s} error=${s}`,
    `  textarea ${s} placeholder=${s}`,
    `  select ${s} [${item}, b] value=${s}`,
    `  radio ${s} [${item}, b] value=${s}`,
    `  checkbox ${s}`,
    `  toggle ${s}`,
    `  tabs [${item}, b] active=${s}`,
    `  breadcrumbs [${item}, b]`,
    `  table ${s} [${item}, b]`,
    `    row [${item}, ${item}]`,
    `  list [${item}, b]`,
    '  list',
    `    item ${s} badge=${s} icon=${s}`,
    `  card ${s}`,
    `    image ${s}`,
    `    icon ${s}`,
    `    badge ${s}`,
    `    avatar ${s}`,
    `  empty ${s}`,
    `  error ${s}`,
    `  loading ${s}`,
    `  modal ${s} #m`,
    `    text ${s}`,
    `  note ${s} for=#m`,
    `  button "Open" -> #m ${s}`,
    '',
    `screen ${s} #two of=#one state=${s}`,
    `  text ${s}`,
    '',
    `flow #two -> #one ${s}`,
    '',
  ].join('\n');
}

describe('hostile strings', () => {
  for (const p of PAYLOADS) {
    it(`escapes ${JSON.stringify(p).slice(0, 50)}`, () => {
      const src = everywhere(p);
      const r = render(src);
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const svg = r.svg ?? '';
      // The checker rejects any element or attribute outside the allowlist, any raw < or > in
      // text, and any URL other than a fragment.
      const { elements, texts } = checkSvg(svg);
      for (const bad of ['script', 'foreignObject', 'iframe', 'image', 'style', 'a', 'use'])
        expect(elements).not.toContain(bad);
      void texts;
      // The payload is drawn, as text, not only carried in the embedded source.
      const drawn = checkSvg(render(src, { embedSource: false }).svg ?? '').texts;
      expect(drawn.some((t) => t.includes(p))).toBe(true);
      // The source comes back out exactly.
      expect(extractSource(svg)).toBe(src);
    });
  }

  it('rejects control characters anywhere, which XML cannot carry', () => {
    for (const c of ['\u0000', '\u0001', '\u0008', '\u000B', '\u000C', '\u001B', '\u007F', '￾', '￿']) {
      const ds = validate(`screen "a${c}b"\n`);
      expect(
        ds.map((d) => d.code),
        JSON.stringify(c),
      ).toEqual(['E106']);
      expect(render(`screen "a${c}b"\n`).svg).toBeNull();
    }
  });

  it('replaces lone surrogates instead of passing them through', () => {
    const r = render('screen "a\uD800b"\n');
    expect(r.svg).not.toBeNull();
    expect(r.svg).toContain('a�b');
  });

  it('treats host theme values as untrusted', () => {
    const r = render('screen "A"\n', {
      themes: { evil: { tokens: { 'color.primary': 'url(javascript:x)', 'font.body': '<script>' } } },
      defaultTheme: 'evil',
    });
    checkSvg(r.svg ?? '');
    // Both problems are at line 1, column 1, so they share one W504 (spec section 15).
    expect(r.diagnostics.map((d) => d.code)).toEqual(['W504']);
  });
});
