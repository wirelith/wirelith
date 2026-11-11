// SPDX-License-Identifier: MIT

// The only way core writes SVG. Every element goes through `el`, which accepts only the elements
// and attributes the specification allows (Appendix D), writes attributes in the specified order,
// and escapes every attribute value and every piece of text. There is no way to emit markup from
// a string.

/** Allowed attributes, in output order (spec Appendix D). */
const ORDER: Record<string, readonly string[]> = {
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

export type Attrs = Record<string, string | number | undefined>;

/** A piece of SVG that is already safe: only `el` and `text` make these. */
export class Markup {
  constructor(readonly value: string) {}
}

/** Escapes text content. */
export function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escapes an attribute value. */
export function escAttr(s: string): string {
  return escText(s).replace(/"/g, '&quot;');
}

/** Formats a position or size: at most one decimal place, no trailing zero, no -0. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) throw new Error('not a finite number');
  const v = Math.round(n * 10) / 10;
  if (v === 0) return '0';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Formats with up to four decimal places, rounded half up, no trailing zero. */
export function fmt4(n: number): string {
  const v = Math.floor(n * 10000 + 0.5) / 10000;
  if (v === 0) return '0';
  return String(Number(v.toFixed(4)));
}

/** Makes one element. Children are Markup (from `el`) or plain strings, which are escaped. */
export function el(tag: string, attrs: Attrs, ...children: (Markup | string | undefined)[]): Markup {
  const order = ORDER[tag];
  if (!order) throw new Error(`<${tag}> is not allowed in Wirelith output`);
  for (const k of Object.keys(attrs)) {
    if (!order.includes(k)) throw new Error(`${k} is not allowed on <${tag}>`);
  }
  let out = `<${tag}`;
  for (const k of order) {
    const v = attrs[k];
    if (v === undefined) continue;
    out += ` ${k}="${escAttr(typeof v === 'number' ? fmt(v) : v)}"`;
  }
  const body = children
    .filter((c): c is Markup | string => c !== undefined)
    .map((c) => (c instanceof Markup ? c.value : escText(c)))
    .join('');
  return new Markup(
    body === '' && tag !== 'title' && tag !== 'desc' && tag !== 'text'
      ? `${out}/>`
      : `${out}>${body}</${tag}>`,
  );
}

/** Joins pieces of markup. */
export function join(parts: (Markup | undefined)[], sep = ''): Markup {
  return new Markup(
    parts
      .filter((p): p is Markup => p !== undefined)
      .map((p) => p.value)
      .join(sep),
  );
}
