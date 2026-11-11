// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractSource, render } from '../src/index.js';
import { checkSvg } from './svg-check.js';

/** Every wirelith fence in a markdown file. */
function fences(path: string): string[] {
  const out: string[] = [];
  const lines = readFileSync(path, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== '```wirelith') continue;
    const body: string[] = [];
    for (i++; i < lines.length && lines[i] !== '```'; i++) body.push(lines[i] ?? '');
    out.push(`${body.join('\n')}\n`);
  }
  return out;
}

const sources = [...fences('spec/spec.md'), ...fences('spec/ai-spec.md')];

describe('render', () => {
  it('every complete source in the spec renders to SVG that passes the strict checker', () => {
    let rendered = 0;
    for (const src of sources) {
      const r = render(src);
      if (r.svg === null) continue; // fragments, such as a lone button line
      checkSvg(r.svg);
      rendered++;
    }
    expect(rendered).toBeGreaterThanOrEqual(14);
  });

  it('has a title, a description and the embedded source', () => {
    const src =
      'screen "Sign in" phone #signin\n  button "Go" primary -> #home\n\nscreen "Home" phone #home\n';
    const svg = render(src).svg ?? '';
    expect(svg).toContain('<title id="wl-title">2 screens</title>');
    expect(svg).toContain('<desc id="wl-desc">Screens: Sign in, Home. 1 link.</desc>');
    expect(extractSource(svg)).toBe(src);
  });

  it('uses the screen title for one screen, and the theme for a specimen', () => {
    expect(render('screen "Alone"\n').svg).toContain('<title id="wl-title">Alone</title>');
    expect(render('theme ink\n').svg).toContain('<title id="wl-title">Theme: ink</title>');
    expect(render('').svg).toContain('<title id="wl-title">Theme: paper</title>');
  });

  it('draws nothing for a source with errors', () => {
    const r = render('screen "A"\n  textfield "x"\n');
    expect(r.svg).toBeNull();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E201']);
  });

  it('can leave out the source, change the id prefix, and draw a single screen or overlay', () => {
    const src = 'screen "A" #a\n  button "Open" -> #m\n  modal "M" #m\n    text "Hi"\nscreen "B" #b\n';
    expect(render(src, { embedSource: false }).svg).not.toContain('wl:source');
    const p = render(src, { idPrefix: 'doc2' }).svg ?? '';
    expect(p).toContain('id="doc2-a"');
    expect(p).not.toContain('id="wl-');
    const one = render(src, { screen: 'b' }).svg ?? '';
    expect(one).toContain('<title id="wl-title">B</title>');
    const overlay = render(src, { screen: 'm' }).svg ?? '';
    expect(overlay).toContain('class="wl-modal"');
    expect(() => render(src, { screen: 'nope' })).toThrow();
    expect(() => render(src, { idPrefix: '1bad' })).toThrow(TypeError);
  });

  it('gives elements in an overlay frame ids that are unique in the document', () => {
    const src = 'screen "A" #a\n  button "Open" #open -> #m\n  modal "M" #m\n    text "Hi"\n';
    const { ids } = checkSvg(render(src).svg ?? '');
    expect(ids).toContain('wl-open');
    expect(ids).toContain('wl-m-frame');
  });
});

describe('extractSource', () => {
  it('returns null when there is no embedded source', () => {
    expect(extractSource('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBeNull();
    expect(extractSource('not svg at all')).toBeNull();
  });

  it('decodes entities but leaves bad ones alone', () => {
    const svg =
      '<svg><metadata><wl:source xmlns:wl="urn:wirelith:source" version="0.1">a &amp; &lt;b&gt; &#x41;&#66; &bogus; &#xD800;</wl:source></metadata></svg>';
    expect(extractSource(svg)).toBe('a & <b> AB &bogus; &#xD800;');
  });
});
