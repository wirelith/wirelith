// SPDX-License-Identifier: MIT

// A strict checker for Wirelith's SVG output, written from the specification (sections 12.1 and
// 12.2, Appendix D) independently of the renderer. It parses the output as XML and fails on any
// element, attribute, URL or entity the specification doesn't allow.

const ALLOWED: Record<string, string[]> = {
  svg: ['xmlns', 'width', 'height', 'viewBox', 'role', 'aria-labelledby', 'xml:space'],
  title: ['id'],
  desc: ['id'],
  metadata: [],
  'wl:source': ['xmlns:wl', 'version'],
  defs: [],
  clipPath: ['id'],
  marker: ['id', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits'],
  g: [
    'id',
    'class',
    'transform',
    'clip-path',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'aria-hidden',
  ],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'fill-opacity', 'stroke', 'stroke-width'],
  circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
  line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'marker-end'],
  text: ['x', 'y', 'font-family', 'font-size', 'font-weight', 'fill'],
  tspan: ['fill'],
};

const NUMERIC = new Set([
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'font-size',
  'markerWidth',
  'markerHeight',
  'refX',
  'refY',
]);
const NUMBER = /^-?(0|[1-9][0-9]*)(\.[0-9])?$/;

export interface Checked {
  elements: string[];
  texts: string[];
  ids: string[];
}

/** Parses and checks the SVG. Throws with a description of the first problem. */
export function checkSvg(svg: string): Checked {
  const elements: string[] = [];
  const texts: string[] = [];
  const ids: string[] = [];
  const stack: string[] = [];
  let i = 0;
  const fail = (why: string): never => {
    throw new Error(`${why} at offset ${i}: ${JSON.stringify(svg.slice(Math.max(0, i - 40), i + 40))}`);
  };
  const decode = (s: string, where: string) => {
    if (/[<>]/.test(s)) fail(`unescaped < or > in ${where}`);
    for (const m of s.matchAll(/&([^;]*);?/g)) {
      if (!['amp', 'lt', 'gt', 'quot'].includes(m[1] ?? '') || !m[0].endsWith(';'))
        fail(`entity ${m[0]} in ${where}`);
    }
    return s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
  };
  if (!svg.startsWith('<svg ')) fail('output must start with <svg');
  while (i < svg.length) {
    if (svg[i] === '<') {
      if (svg.startsWith('<!--', i) || svg.startsWith('<?', i) || svg.startsWith('<!', i))
        fail('comment, declaration or processing instruction');
      const close = svg.startsWith('</', i);
      const end = svg.indexOf('>', i);
      if (end < 0) fail('unterminated tag');
      const inner = svg.slice(i + (close ? 2 : 1), end);
      i = end + 1;
      if (close) {
        const name = inner.trim();
        if (stack.pop() !== name) fail(`mismatched </${name}>`);
        continue;
      }
      const selfClosing = inner.endsWith('/');
      const body = selfClosing ? inner.slice(0, -1) : inner;
      const m = /^([A-Za-z][A-Za-z0-9:]*)((?:\s+[^\s=]+="[^"]*")*)\s*$/.exec(body);
      if (!m) fail(`malformed tag <${inner}>`);
      const name = m?.[1] ?? '';
      const allowed = ALLOWED[name];
      if (!allowed) fail(`element <${name}> is not allowed`);
      if (name === 'wl:source' && stack[stack.length - 1] !== 'metadata') fail('wl:source outside metadata');
      const attrs = [...(m?.[2] ?? '').matchAll(/\s+([^\s=]+)="([^"]*)"/g)].map(
        (a) => [a[1] ?? '', a[2] ?? ''] as const,
      );
      let last = -1;
      for (const [k, raw] of attrs) {
        const pos = allowed?.indexOf(k) ?? -1;
        if (pos < 0) fail(`attribute ${k} is not allowed on <${name}>`);
        if (pos <= last) fail(`attribute ${k} on <${name}> is out of order`);
        last = pos;
        const v = decode(raw, `${name}@${k}`);
        if (/url\(/i.test(v) && !/^url\(#[A-Za-z][A-Za-z0-9_-]*\)$/.test(v)) fail(`non-fragment URL in ${k}`);
        if (/javascript:|data:|https?:/i.test(v) && !(name === 'svg' && k === 'xmlns') && !(k === 'xmlns:wl'))
          fail(`URL-like value in ${k}`);
        if (NUMERIC.has(k) && !NUMBER.test(v)) fail(`${k}="${v}" is not a number in the specified format`);
        if (k === 'id') ids.push(v);
      }
      elements.push(name);
      if (!selfClosing) stack.push(name);
    } else {
      const next = svg.indexOf('<', i);
      const raw = svg.slice(i, next < 0 ? svg.length : next);
      i = next < 0 ? svg.length : next;
      if (raw.trim() === '') continue;
      const parent = stack[stack.length - 1];
      if (!parent || !['text', 'tspan', 'title', 'desc', 'wl:source'].includes(parent))
        fail(`text inside <${parent}>`);
      texts.push(decode(raw, `<${parent}> text`));
    }
  }
  if (stack.length > 0) fail(`unclosed <${stack.join('><')}>`);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`duplicate id ${id}`);
    seen.add(id);
  }
  return { elements, texts, ids };
}
