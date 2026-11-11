// SPDX-License-Identifier: MIT

// Layout (spec section 10 and Appendix C): a box for every element, then the overview of frames,
// notes and arrows (sections 6, 7.4 and 10.6).

import { DEVICES, OVERLAYS } from './components.js';
import { type Font, lineWidth, longestWord, measure, r, wrap } from './measure.js';
import { diagnostic } from './parse.js';
import type { Theme } from './theme.js';
import type { Diagnostic, Document, Node, Value } from './types.js';
import { textOf, walk } from './validate.js';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An element with its box, relative to its frame. */
export interface Laid {
  node: Node;
  index: number;
  box: Box;
  children: Laid[];
  /** Wrapped lines, for text that wraps. */
  lines?: string[];
  /** Entries for nav, tabs, breadcrumbs and list, with their boxes. */
  entries?: { text: string; box: Box; active: boolean; icon?: string }[];
  /** Column x positions for tables, relative to the table's box, and the table box's top. */
  columns?: number[];
  tableTop?: number;
}

export interface Frame {
  /** The frame's id in the output: the screen's, or `<overlay>-frame`. */
  key: string;
  screen: Node;
  /** The overlay this frame shows open, for an extra frame. */
  overlay?: Laid;
  /** Overlays drawn open in this frame. */
  open: Laid[];
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  deviceH: number;
  header?: Laid;
  footer?: Laid;
  sidebars: Laid[];
  body: Laid[];
  notes: { number: number; text: string; lines: string[]; target?: Box }[];
  /** The width of the notes column, or 0. */
  notesW: number;
  notesH: number;
}

const MAIN_H = new Set(['row', 'header', 'footer']);
/** Leaves drawn at their own width at the start of a wider box (Appendix C.1). */
const OWN_WIDTH = new Set(['badge', 'avatar', 'icon', 'checkbox', 'toggle', 'radio']);
const CONTAINERS = new Set([
  'row',
  'column',
  'grid',
  'header',
  'footer',
  'sidebar',
  'card',
  'tabs',
  'list',
  'empty',
  'error',
  'nav',
  'table',
]);

const has = (n: Node, f: string) => n.flags?.includes(f) ?? false;
const num = (v: Value | undefined): number | undefined => (typeof v === 'number' ? v : undefined);

export class Layout {
  readonly u: number;
  readonly warnings: Diagnostic[] = [];
  readonly index = new Map<Node, number>();

  constructor(
    readonly doc: Document,
    readonly theme: Theme,
  ) {
    this.u = theme.space;
    for (const w of walk(doc)) this.index.set(w.node, w.index);
  }

  // ---- fonts ------------------------------------------------------------------------------

  body(size: number, weight: number): Font {
    return { font: this.theme.fontBody, weight, size };
  }

  heading(size: number, weight: number): Font {
    return { font: this.theme.fontHeading, weight, size };
  }

  /** Font and line height of a text component (Appendix C.4). */
  textStyle(type: string): { f: Font; lh: number } {
    switch (type) {
      case 'h1':
        return { f: this.heading(32, 700), lh: 40 };
      case 'h2':
        return { f: this.heading(24, 700), lh: 32 };
      case 'h3':
        return { f: this.heading(18, 600), lh: 24 };
      case 'label':
        return { f: this.body(13, 500), lh: 18 };
      default:
        return { f: this.body(15, 400), lh: 22 };
    }
  }

  /** Wrapped lines of a text. */
  wrapText(text: string, f: Font, width: number): string[] {
    return wrap(text, f, width).lines;
  }

  // ---- spacing ----------------------------------------------------------------------------

  /** A size word in pixels (section 10.1). */
  scale(word: Value | undefined, fallback: number): number {
    const u = this.u;
    switch (word) {
      case 'none':
        return 0;
      case 'xs':
        return u;
      case 'sm':
        return 2 * u;
      case 'md':
        return 4 * u;
      case 'lg':
        return 6 * u;
      case 'xl':
        return 8 * u;
      default:
        return fallback;
    }
  }

  gap(n: Node): number {
    return this.scale(n.attrs?.gap, 4 * this.u);
  }

  pad(n: Node): number {
    const u = this.u;
    const fallback = n.type === 'card' ? 4 * u : n.type === 'sidebar' ? 4 * u : 0;
    return this.scale(n.attrs?.pad, fallback);
  }

  align(n: Node): string {
    const a = n.attrs?.align;
    if (a === 'start' || a === 'center' || a === 'end' || a === 'stretch') return a;
    return MAIN_H.has(n.type) ? 'center' : 'stretch';
  }

  justify(n: Node): string {
    const j = n.attrs?.justify;
    return j === 'center' || j === 'end' || j === 'between' ? j : 'start';
  }

  // ---- intrinsic widths (section 10.4) ----------------------------------------------------

  /** Preferred and minimum widths. */
  intrinsic(n: Node): { pref: number; min: number } {
    const u = this.u;
    const fixed = num(n.attrs?.width);
    if (fixed !== undefined) return { pref: fixed, min: fixed };
    const label = n.label ?? '';
    switch (n.type) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'text':
      case 'label':
      case 'link': {
        const { f } = this.textStyle(n.type);
        if (n.type === 'text' && n.label === undefined) return { pref: 240, min: 96 };
        return { pref: lineWidth(label, f), min: longestWord(label, f) };
      }
      case 'badge': {
        const w = measure(label, this.body(13, 500)) + 4 * u;
        return { pref: w, min: w };
      }
      case 'button': {
        const icon = n.attrs?.icon !== undefined;
        const h = this.buttonHeight(n);
        if (icon && n.label === undefined) return { pref: h, min: h };
        const w = measure(label, this.body(15, 600)) + 8 * u + (icon ? 6 * u : 0);
        return { pref: w, min: w };
      }
      case 'input':
      case 'textarea':
      case 'select':
        return { pref: 240, min: 96 };
      case 'checkbox':
      case 'toggle': {
        const mark = n.type === 'toggle' ? 36 : 16;
        const w = mark + 2 * u + measure(label, this.body(15, 400));
        return { pref: w, min: w };
      }
      case 'radio': {
        let w = n.label !== undefined ? measure(label, this.body(13, 500)) : 0;
        for (const it of n.items ?? []) w = Math.max(w, 16 + 2 * u + measure(it, this.body(15, 400)));
        return { pref: w, min: w };
      }
      case 'icon': {
        const s = this.iconSize(n);
        return { pref: s, min: s };
      }
      case 'avatar': {
        const s = this.avatarSize(n);
        return { pref: s, min: s };
      }
      case 'image':
        return { pref: 160, min: 160 };
      case 'spacer': {
        const s = n.attrs?.size;
        const w = typeof s === 'number' ? s : s !== undefined ? this.scale(s, 0) : 0;
        return { pref: w, min: w };
      }
      case 'divider':
        return { pref: this.theme.stroke, min: this.theme.stroke };
      case 'item': {
        let w = 6 * u + measure(label, this.body(15, 400));
        if (n.attrs?.icon !== undefined) w += 16 + 2 * u;
        const b = textOf(n.attrs?.badge);
        if (b !== undefined) w += 2 * u + measure(b, this.body(13, 500)) + 4 * u;
        return { pref: w, min: w };
      }
      case 'breadcrumbs': {
        const items = n.items ?? [];
        let w = 0;
        items.forEach((it, i) => {
          w += measure(it, this.body(15, i === items.length - 1 ? 500 : 400));
          if (i > 0) w += 16 + 2 * u;
        });
        return { pref: w, min: w };
      }
      case 'nav': {
        const entries = this.navEntries(n);
        const vertical = has(n, 'vertical');
        let sum = 0;
        let max = 0;
        for (const e of entries) {
          const ew = measure(e.text, this.body(15, 600)) + (e.icon ? 16 + 2 * u : 0);
          sum += ew;
          max = Math.max(max, ew);
        }
        const w = vertical ? max + 6 * u : sum + Math.max(0, entries.length - 1) * 6 * u;
        return { pref: w, min: vertical ? w : max };
      }
      case 'tabs': {
        let w = 0;
        for (const t of n.items ?? []) w += measure(t, this.body(15, 600)) + 8 * u;
        const c = this.columnIntrinsic(n.children ?? [], 0);
        return { pref: Math.max(w, c.pref), min: Math.max(Math.min(w, 96), c.min) };
      }
      case 'list': {
        if (n.items) {
          let w = 0;
          for (const it of n.items) w = Math.max(w, 5 * u + measure(it, this.body(15, 400)));
          return { pref: w, min: Math.min(w, 96) };
        }
        return this.columnIntrinsic(n.children ?? [], 0);
      }
      case 'table': {
        const cols = Math.max(1, n.items?.length ?? 1);
        return { pref: 120 * cols, min: 64 * cols };
      }
      case 'card': {
        const p = this.pad(n);
        const c = this.columnIntrinsic(n.children ?? [], 0);
        const t = n.label !== undefined ? measure(n.label, this.heading(15, 600)) : 0;
        return { pref: Math.max(c.pref, t) + 2 * p, min: Math.max(c.min, Math.min(t, 96)) + 2 * p };
      }
      case 'empty':
      case 'error':
      case 'loading': {
        const msg = n.label !== undefined ? lineWidth(n.label, this.body(15, 400)) : 0;
        const c = this.columnIntrinsic(n.children ?? [], 0);
        const w = Math.max(32, msg, c.pref);
        return { pref: w, min: Math.max(32, c.min, n.label ? longestWord(n.label, this.body(15, 400)) : 0) };
      }
      case 'sidebar': {
        const w = num(n.attrs?.width) ?? 240;
        return { pref: w, min: w };
      }
      case 'swatches':
        return { pref: 3 * 200 + 2 * 4 * u, min: 3 * 200 + 2 * 4 * u };
      case 'row':
      case 'header':
      case 'footer': {
        const kids = this.flowChildren(n);
        const p = this.pad(n);
        const g = this.gap(n);
        let pref = 0;
        let min = 0;
        for (const c of kids) {
          const i = this.intrinsic(c);
          pref += i.pref;
          min += i.min;
        }
        const gaps = Math.max(0, kids.length - 1) * g;
        return {
          pref: pref + gaps + 2 * p,
          min: (has(n, 'wrap') ? Math.max(0, ...kids.map((c) => this.intrinsic(c).min)) : min + gaps) + 2 * p,
        };
      }
      case 'grid': {
        const cols = this.cols(n);
        const g = this.gap(n);
        let max = 0;
        let maxMin = 0;
        for (const c of n.children ?? []) {
          const i = this.intrinsic(c);
          max = Math.max(max, i.pref / Math.min(cols, this.span(c, cols)));
          maxMin = Math.max(maxMin, i.min / Math.min(cols, this.span(c, cols)));
        }
        const p = this.pad(n);
        return {
          pref: r(max * cols + g * (cols - 1) + 2 * p),
          min: r(maxMin * cols + g * (cols - 1) + 2 * p),
        };
      }
      default:
        return this.columnIntrinsic(n.children ?? [], this.pad(n));
    }
  }

  columnIntrinsic(kids: Node[], pad: number): { pref: number; min: number } {
    let pref = 0;
    let min = 0;
    for (const c of kids) {
      if (c.type === 'note' || OVERLAYS.has(c.type)) continue;
      const i = this.intrinsic(c);
      pref = Math.max(pref, i.pref);
      min = Math.max(min, i.min);
    }
    return { pref: pref + 2 * pad, min: min + 2 * pad };
  }

  // ---- sizes of parts ----------------------------------------------------------------------

  buttonHeight(n: Node): number {
    return (has(n, 'sm') ? 7 : has(n, 'lg') ? 11 : 9) * this.u;
  }

  iconSize(n: Node): number {
    return has(n, 'sm') ? 16 : has(n, 'lg') ? 24 : 20;
  }

  avatarSize(n: Node): number {
    return has(n, 'sm') ? 24 : has(n, 'lg') ? 48 : 32;
  }

  cols(n: Node): number {
    const c = n.attrs?.cols;
    return typeof c === 'number' && Number.isInteger(c) && c >= 1 && c <= 12 ? c : 2;
  }

  span(n: Node, cols: number): number {
    const s = n.attrs?.span;
    const v = typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 12 ? s : 1;
    return Math.min(v, cols);
  }

  /** The children that are laid out in a container's flow (notes and overlays are not). */
  flowChildren(n: Node): Node[] {
    return (n.children ?? []).filter((c) => c.type !== 'note' && !OVERLAYS.has(c.type));
  }

  navEntries(n: Node): { text: string; active: boolean; icon?: string; node?: Node }[] {
    const active = textOf(n.attrs?.active);
    if (n.items) return n.items.map((t) => ({ text: t, active: t === active }));
    return (n.children ?? [])
      .filter((c) => c.type === 'item')
      .map((c) => {
        const e: { text: string; active: boolean; icon?: string; node?: Node } = {
          text: c.label ?? '',
          active: has(c, 'active') || (c.label !== undefined && c.label === active),
          node: c,
        };
        const icon = textOf(c.attrs?.icon);
        if (icon !== undefined) e.icon = icon;
        return e;
      });
  }

  /** A child's width in a container whose content width is `w` (section 10.3). */
  widthIn(c: Node, w: number): number | undefined {
    const v = c.attrs?.width;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      if (v === 'fill') return w;
      const m = /^([0-9]+(\.[0-9]+)?)%$/.exec(v);
      if (m) return r((w * Number(m[1])) / 100);
    }
    return undefined;
  }

  // ---- layout ------------------------------------------------------------------------------

  laid(n: Node, x: number, y: number, w: number, h: number): Laid {
    return {
      node: n,
      index: this.index.get(n) ?? 0,
      box: { x: r(x), y: r(y), w: r(w), h: r(h) },
      children: [],
    };
  }

  warn(code: string, n: Node, message: string): void {
    this.warnings.push(diagnostic(code, n.loc, `Line ${n.loc.line}: ${message}`));
  }

  /** Lays out an element at (x, y) with width w. Returns it with its height. */
  place(n: Node, x: number, y: number, w: number): Laid {
    const u = this.u;
    const label = n.label ?? '';
    const fixedH = this.fixedHeight(n);
    let out: Laid;
    switch (n.type) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'text':
      case 'link': {
        const { f, lh } = this.textStyle(n.type);
        if (n.type === 'text' && n.label === undefined) {
          const lines = num(n.attrs?.lines);
          const count =
            lines !== undefined && Number.isInteger(lines) && lines >= 1 && lines <= 100 ? lines : 3;
          out = this.laid(n, x, y, w, count * lh);
          break;
        }
        const wr = wrap(label, f, w);
        if (wr.clipped) this.warn('W602', n, 'a word is wider than its line and was clipped');
        out = this.laid(n, x, y, w, wr.lines.length * lh);
        out.lines = wr.lines;
        break;
      }
      case 'label':
        out = this.laid(n, x, y, w, 18);
        break;
      case 'button':
        out = this.laid(n, x, y, w, this.buttonHeight(n));
        break;
      case 'input':
      case 'select':
      case 'textarea': {
        let h = n.label !== undefined ? 18 + u : 0;
        if (n.type === 'textarea') {
          const rows = num(n.attrs?.rows);
          h +=
            (rows !== undefined && Number.isInteger(rows) && rows >= 1 && rows <= 100 ? rows : 3) * 22 +
            4 * u;
        } else {
          h += 10 * u;
        }
        if (n.type === 'input' && textOf(n.attrs?.error) !== undefined) h += u + 18;
        out = this.laid(n, x, y, w, h);
        break;
      }
      case 'checkbox':
      case 'toggle':
        out = this.laid(n, x, y, w, 6 * u);
        break;
      case 'radio':
        out = this.laid(n, x, y, w, (n.label !== undefined ? 18 + u : 0) + (n.items?.length ?? 0) * 6 * u);
        break;
      case 'icon':
        out = this.laid(n, x, y, w, this.iconSize(n));
        break;
      case 'avatar':
        out = this.laid(n, x, y, w, this.avatarSize(n));
        break;
      case 'badge':
        out = this.laid(n, x, y, w, 20);
        break;
      case 'image': {
        let ratio = 4 / 3;
        const rv = n.attrs?.ratio;
        const m = typeof rv === 'string' ? /^([0-9]+(\.[0-9]+)?):([0-9]+(\.[0-9]+)?)$/.exec(rv) : null;
        if (m && Number(m[1]) > 0 && Number(m[3]) > 0) ratio = Number(m[1]) / Number(m[3]);
        // A fixed height is the image's height (section 10.4), not a limit its content overflows.
        out = this.laid(n, x, y, w, fixedH ?? r(w / ratio));
        break;
      }
      case 'spacer': {
        const s = n.attrs?.size;
        const v = typeof s === 'number' ? s : s !== undefined ? this.scale(s, 0) : 0;
        out = this.laid(n, x, y, w, v);
        break;
      }
      case 'divider':
        out = this.laid(n, x, y, w, this.theme.stroke);
        break;
      case 'item':
        out = this.laid(n, x, y, w, 9 * u);
        break;
      case 'breadcrumbs':
        out = this.laid(n, x, y, w, 6 * u);
        break;
      case 'nav':
        out = this.placeNav(n, x, y, w);
        break;
      case 'tabs':
        out = this.placeTabs(n, x, y, w);
        break;
      case 'list':
        out = this.placeList(n, x, y, w);
        break;
      case 'table':
        out = this.placeTable(n, x, y, w);
        break;
      case 'card': {
        const p = this.pad(n);
        const titleH = n.label !== undefined ? 22 + this.gap(n) : 0;
        const inner = this.placeColumn(
          n,
          this.flowChildren(n),
          x + p,
          y + p + titleH,
          w - 2 * p,
          this.gap(n),
          'stretch',
          undefined,
        );
        out = this.laid(n, x, y, w, 2 * p + titleH + inner.h);
        out.children = inner.children;
        break;
      }
      case 'empty':
      case 'error':
      case 'loading': {
        const f = this.body(15, 400);
        let h = 8 * u + (n.type === 'loading' ? 24 : 32);
        let lines: string[] | undefined;
        if (n.label !== undefined) {
          lines = wrap(n.label, f, w).lines;
          h += 2 * u + lines.length * 22;
        }
        const kids = this.flowChildren(n);
        let children: Laid[] = [];
        if (kids.length > 0 && n.type !== 'loading') {
          h += 4 * u;
          const inner = this.placeColumn(n, kids, x, y + h, w, 4 * u, 'center', undefined);
          children = inner.children;
          h += inner.h;
        }
        h += 8 * u;
        out = this.laid(n, x, y, w, h);
        if (lines) out.lines = lines;
        out.children = children;
        break;
      }
      case 'swatches':
        out = this.laid(n, x, y, w, 3 * 36 + 2 * 4 * u);
        break;
      case 'row':
      case 'header':
      case 'footer':
        out = this.placeRow(n, x, y, w);
        break;
      case 'grid':
        out = this.placeGrid(n, x, y, w);
        break;
      case 'sidebar':
      case 'column': {
        const p = this.pad(n);
        const inner = this.placeColumn(
          n,
          this.flowChildren(n),
          x + p,
          y + p,
          w - 2 * p,
          this.gap(n),
          this.align(n),
          fixedH !== undefined ? fixedH - 2 * p : undefined,
        );
        out = this.laid(n, x, y, w, inner.h + 2 * p);
        out.children = inner.children;
        break;
      }
      default:
        out = this.laid(n, x, y, w, 0);
    }
    if (fixedH !== undefined) {
      if (out.box.h > fixedH)
        this.warn('W601', n, `the content is ${r(out.box.h - fixedH)} px taller than height=${fixedH}`);
      out.box.h = r(fixedH);
    }
    return out;
  }

  fixedHeight(n: Node): number | undefined {
    const h = n.attrs?.height;
    return typeof h === 'number' ? h : undefined;
  }

  /** A vertical container's children (section 10.3, steps 2, 4 and 5). */
  placeColumn(
    owner: Node,
    kids: Node[],
    x: number,
    y: number,
    w: number,
    gap: number,
    align: string,
    room: number | undefined,
  ): { children: Laid[]; h: number } {
    const children: Laid[] = [];
    let cy = y;
    for (const c of kids) {
      const fixed = this.widthIn(c, w);
      let cw: number;
      if (fixed !== undefined) cw = fixed;
      else if (align === 'stretch' && !OWN_WIDTH.has(c.type)) cw = w;
      else cw = Math.min(this.intrinsic(c).pref, w);
      let cx = x;
      const a = align === 'stretch' ? 'start' : align;
      if (a === 'center') cx = x + r((w - cw) / 2);
      else if (a === 'end') cx = x + w - cw;
      const l = this.place(c, cx, cy, cw);
      children.push(l);
      cy += l.box.h + gap;
    }
    let h = kids.length > 0 ? cy - gap - y : 0;
    // Free room: shared among spacers without a size and children with grow, else justify.
    if (room !== undefined && room > h) {
      const free = room - h;
      const growers = children.filter(
        (l) => (l.node.type === 'spacer' && l.node.attrs?.size === undefined) || has(l.node, 'grow'),
      );
      if (growers.length > 0) {
        const shares = share(free, growers.length);
        let shift = 0;
        for (const l of children) {
          l.box.y = r(l.box.y + shift);
          shiftChildren(l, 0, shift);
          const gi = growers.indexOf(l);
          if (gi >= 0) {
            const add = shares[gi] ?? 0;
            l.box.h = r(l.box.h + add);
            shift += add;
          }
        }
      } else {
        const j = this.justify(owner);
        const offsets = justifyOffsets(j, free, children.length);
        children.forEach((l, i) => {
          const d = offsets[i] ?? 0;
          l.box.y = r(l.box.y + d);
          shiftChildren(l, 0, d);
        });
      }
      h = room;
    }
    void owner;
    return { children, h };
  }

  /** A horizontal container (section 10.3, step 3). */
  placeRow(n: Node, x: number, y: number, w: number): Laid {
    const u = this.u;
    const isBar = n.type === 'header' || n.type === 'footer';
    const padV = isBar ? 3 * u : this.pad(n);
    const padH = isBar ? (this.barPad ?? this.pad(n)) : this.pad(n);
    const gap = this.gap(n);
    const W = w - 2 * padH;
    const kids = this.flowChildren(n);
    const lines: Node[][] = [];
    if (has(n, 'wrap')) {
      let line: Node[] = [];
      let used = 0;
      for (const c of kids) {
        const cw = this.widthIn(c, W) ?? this.intrinsic(c).pref;
        if (line.length > 0 && used + gap + cw > W) {
          lines.push(line);
          line = [];
          used = 0;
        }
        used += (line.length > 0 ? gap : 0) + cw;
        line.push(c);
      }
      if (line.length > 0) lines.push(line);
    } else {
      lines.push(kids);
    }
    const children: Laid[] = [];
    let cy = y + padV;
    for (const line of lines) {
      const placed = this.placeRowLine(n, line, x + padH, cy, W, gap);
      children.push(...placed.children);
      cy += placed.h + gap;
    }
    const contentH = lines.length > 0 ? cy - gap - (y + padV) : 0;
    const out = this.laid(n, x, y, w, contentH + 2 * padV);
    out.children = children;
    return out;
  }

  /** Set while laying out a screen's header and footer, whose side padding is the screen's. */
  barPad: number | undefined;

  placeRowLine(
    owner: Node,
    kids: Node[],
    x: number,
    y: number,
    W: number,
    gap: number,
  ): { children: Laid[]; h: number } {
    const n = kids.length;
    const widths: number[] = new Array(n).fill(0);
    const growers: number[] = [];
    const flexible: number[] = [];
    let used = Math.max(0, n - 1) * gap;
    kids.forEach((c, i) => {
      const fixed = c.type === 'sidebar' ? (num(c.attrs?.width) ?? 240) : this.widthIn(c, W);
      const isFill = c.attrs?.width === 'fill';
      if (fixed !== undefined && !isFill) {
        widths[i] = fixed;
      } else if (isFill || has(c, 'grow') || (c.type === 'spacer' && c.attrs?.size === undefined)) {
        growers.push(i);
      } else {
        widths[i] = this.intrinsic(c).pref;
        flexible.push(i);
      }
      used += widths[i] ?? 0;
    });
    let free = W - used;
    if (free >= 0 && growers.length > 0) {
      const shares = share(free, growers.length);
      growers.forEach((gi, k) => {
        widths[gi] = shares[k] ?? 0;
      });
      free = 0;
    } else if (free < 0) {
      // Shrink flexible children by a common factor, to no less than their minimum.
      const mins = kids.map((c) => this.intrinsic(c).min);
      let active = [...flexible];
      for (let guard = 0; guard < n + 1 && active.length > 0; guard++) {
        const total = active.reduce((s, i) => s + (widths[i] ?? 0), 0);
        const target = total + free;
        if (total <= 0) break;
        const factor = Math.max(0, target / total);
        let frozen = false;
        for (const i of active) {
          const want = r((widths[i] ?? 0) * factor);
          const min = mins[i] ?? 0;
          if (want < min) {
            free += (widths[i] ?? 0) - min;
            widths[i] = min;
            frozen = true;
          }
        }
        if (frozen) {
          active = active.filter((i) => (widths[i] ?? 0) > (mins[i] ?? 0));
          continue;
        }
        let gained = 0;
        for (const i of active) {
          const nw = r((widths[i] ?? 0) * factor);
          gained += (widths[i] ?? 0) - nw;
          widths[i] = nw;
        }
        free += gained;
        break;
      }
      if (free < 0) this.warn('W601', owner, `this row is ${r(-free)} px too wide for its container`);
    }
    // Main-axis positions.
    const offsets =
      growers.length > 0 || free <= 0 ? new Array(n).fill(0) : justifyOffsets(this.justify(owner), free, n);
    const children: Laid[] = [];
    let cx = x;
    kids.forEach((c, i) => {
      const l = this.place(c, cx + (offsets[i] ?? 0), y, widths[i] ?? 0);
      children.push(l);
      cx += (widths[i] ?? 0) + gap;
    });
    // Cross-axis alignment.
    const H = children.reduce((m, l) => Math.max(m, l.box.h), 0);
    const align = this.align(owner);
    for (const l of children) {
      const c = l.node;
      if (c.type === 'sidebar' || c.type === 'divider' || (align === 'stretch' && CONTAINERS.has(c.type))) {
        l.box.h = H;
        continue;
      }
      let dy = 0;
      if (align === 'center') dy = r((H - l.box.h) / 2);
      else if (align === 'end') dy = H - l.box.h;
      if (dy !== 0) {
        l.box.y = r(l.box.y + dy);
        shiftChildren(l, 0, dy);
      }
    }
    return { children, h: H };
  }

  placeGrid(n: Node, x: number, y: number, w: number): Laid {
    const p = this.pad(n);
    const g = this.gap(n);
    const cols = this.cols(n);
    const W = w - 2 * p;
    const widths = share(W - g * (cols - 1), cols);
    const colX: number[] = [];
    let acc = x + p;
    for (let i = 0; i < cols; i++) {
      colX.push(acc);
      acc += (widths[i] ?? 0) + g;
    }
    const children: Laid[] = [];
    let col = 0;
    let rowY = y + p;
    let row: Laid[] = [];
    const finishRow = () => {
      const H = row.reduce((m, l) => Math.max(m, l.box.h), 0);
      for (const l of row) if (CONTAINERS.has(l.node.type) || l.node.type === 'image') l.box.h = H;
      rowY += H + g;
      row = [];
    };
    for (const c of this.flowChildren(n)) {
      const s = this.span(c, cols);
      if (col + s > cols) {
        finishRow();
        col = 0;
      }
      let cw = 0;
      for (let k = col; k < col + s; k++) cw += widths[k] ?? 0;
      cw += (s - 1) * g;
      const l = this.place(c, colX[col] ?? x, rowY, cw);
      children.push(l);
      row.push(l);
      col += s;
    }
    if (row.length > 0) finishRow();
    const h = children.length > 0 ? rowY - g - (y + p) : 0;
    const out = this.laid(n, x, y, w, h + 2 * p);
    out.children = children;
    return out;
  }

  placeNav(n: Node, x: number, y: number, w: number): Laid {
    const u = this.u;
    const entries = this.navEntries(n);
    const vertical = has(n, 'vertical');
    const out = this.laid(n, x, y, w, vertical ? entries.length * 9 * u : 9 * u);
    out.entries = [];
    let cx = x;
    entries.forEach((e, i) => {
      let box: Box;
      if (vertical) {
        box = { x: r(x), y: r(y + i * 9 * u), w: r(w), h: 9 * u };
      } else {
        const ew = measure(e.text, this.body(15, e.active ? 600 : 400)) + (e.icon ? 16 + 2 * u : 0);
        box = { x: r(cx), y: r(y), w: ew, h: 9 * u };
        cx += ew + 6 * u;
      }
      const entry: { text: string; box: Box; active: boolean; icon?: string } = {
        text: e.text,
        box,
        active: e.active,
      };
      if (e.icon !== undefined) entry.icon = e.icon;
      out.entries?.push(entry);
      if (e.node) {
        const l = this.laid(e.node, box.x, box.y, box.w, box.h);
        out.children.push(l);
      }
    });
    return out;
  }

  placeTabs(n: Node, x: number, y: number, w: number): Laid {
    const u = this.u;
    const items = n.items ?? [];
    const active = textOf(n.attrs?.active) ?? items[0];
    const out = this.laid(n, x, y, w, 10 * u);
    out.entries = [];
    let cx = x;
    for (const t of items) {
      const tw = measure(t, this.body(15, t === active ? 600 : 400)) + 8 * u;
      out.entries.push({ text: t, box: { x: r(cx), y: r(y), w: tw, h: 10 * u }, active: t === active });
      cx += tw;
    }
    const kids = this.flowChildren(n);
    if (kids.length > 0) {
      const inner = this.placeColumn(n, kids, x, y + 10 * u + 4 * u, w, 4 * u, 'stretch', undefined);
      out.children = inner.children;
      out.box.h = r(10 * u + 4 * u + inner.h);
    }
    return out;
  }

  placeList(n: Node, x: number, y: number, w: number): Laid {
    const u = this.u;
    if (n.items) {
      const out = this.laid(n, x, y, w, n.items.length * 9 * u);
      out.entries = n.items.map((t, i) => ({
        text: t,
        box: { x: r(x), y: r(y + i * 9 * u), w: r(w), h: 9 * u },
        active: false,
      }));
      return out;
    }
    const kids = this.flowChildren(n);
    const children: Laid[] = [];
    let cy = y;
    for (const c of kids) {
      const l = this.place(c, x, cy, w);
      children.push(l);
      cy += l.box.h;
    }
    const out = this.laid(n, x, y, w, cy - y);
    out.children = children;
    return out;
  }

  placeTable(n: Node, x: number, y: number, w: number): Laid {
    const u = this.u;
    const cols = Math.max(1, n.items?.length ?? 1);
    const captionH = n.label !== undefined ? 22 + 2 * u : 0;
    const rowsAttr = num(n.attrs?.rows);
    const rowNodes = (n.children ?? []).filter((c) => c.type === 'table-row');
    const bodyRows =
      rowNodes.length > 0
        ? rowNodes.length
        : rowsAttr !== undefined && Number.isInteger(rowsAttr) && rowsAttr >= 1 && rowsAttr <= 100
          ? rowsAttr
          : 3;
    const out = this.laid(n, x, y, w, captionH + 10 * u * (1 + bodyRows));
    out.tableTop = r(y + captionH);
    const widths = share(w, cols);
    out.columns = [];
    let acc = 0;
    for (const cw of widths) {
      out.columns.push(acc);
      acc += cw;
    }
    rowNodes.forEach((rn, i) => {
      out.children.push(this.laid(rn, x, y + captionH + 10 * u * (1 + i), w, 10 * u));
    });
    return out;
  }

  // ---- screens ------------------------------------------------------------------------------

  device(s: Node): { name: 'phone' | 'tablet' | 'desktop' | 'custom'; w: number; h: number } {
    const size = s.attrs?.size;
    const m = typeof size === 'string' ? /^([0-9]+)x([0-9]+)$/.exec(size) : null;
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 16000 && Number(m[2]) >= 1 && Number(m[2]) <= 16000) {
      return { name: 'custom', w: Number(m[1]), h: Number(m[2]) };
    }
    for (const d of ['phone', 'tablet', 'desktop'] as const) {
      if (has(s, d))
        return { name: d, w: (DEVICES[d] as [number, number])[0], h: (DEVICES[d] as [number, number])[1] };
    }
    // A variant uses its base's device.
    const of = s.attrs?.of;
    if (typeof of === 'object' && of !== null && !Array.isArray(of)) {
      const base = this.doc.screens.find((b) => b.id === of.ref);
      if (base && base !== s) return this.device(base);
    }
    return { name: 'desktop', w: 1280, h: 800 };
  }

  /** Lays out a screen's frame, with the given overlays open. */
  frame(s: Node, key: string, open: Node[], extra?: Node): Frame {
    const u = this.u;
    const dev = this.device(s);
    const W = dev.w;
    const P = dev.name === 'phone' ? 4 * u : 6 * u;
    const kids = s.children ?? [];
    const headerN = kids.find((c) => c.type === 'header');
    const footerN = kids.find((c) => c.type === 'footer');
    const left = kids.find((c) => c.type === 'sidebar' && !has(c, 'right'));
    const right = kids.find((c) => c.type === 'sidebar' && has(c, 'right'));
    const bodyKids = kids.filter(
      (c) =>
        c !== headerN &&
        c !== footerN &&
        c !== left &&
        c !== right &&
        c.type !== 'note' &&
        !OVERLAYS.has(c.type),
    );

    this.barPad = P;
    const header = headerN ? this.place(headerN, 0, 0, W) : undefined;
    const footerProbe = footerN ? this.place(footerN, 0, 0, W) : undefined;
    this.barPad = undefined;
    const headerH = header?.box.h ?? 0;
    const footerH = footerProbe?.box.h ?? 0;
    const lw = left ? (num(left.attrs?.width) ?? 240) : 0;
    const rw = right ? (num(right.attrs?.width) ?? 240) : 0;
    const bodyW = Math.max(0, W - lw - rw);
    const room = Math.max(0, dev.h - headerH - footerH - 2 * P);
    const body = this.placeColumn(s, bodyKids, lw + P, headerH + P, bodyW - 2 * P, 4 * u, 'stretch', room);
    const bodyH = body.h + 2 * P;
    const frameH = r(Math.max(dev.h, headerH + bodyH + footerH));
    let footer: Laid | undefined;
    if (footerN) {
      this.barPad = P;
      footer = this.place(footerN, 0, frameH - footerH, W);
      this.barPad = undefined;
    }
    const sideH = frameH - headerH - footerH;
    const sidebars: Laid[] = [];
    for (const [sb, sx, sw] of [
      [left, 0, lw],
      [right, W - rw, rw],
    ] as const) {
      if (!sb) continue;
      const l = this.place(sb, sx, headerH, sw);
      l.box.h = r(sideH);
      sidebars.push(l);
    }

    const openLaid: Laid[] = [];
    let overlay: Laid | undefined;
    for (const o of open) {
      const l = this.placeOverlay(o, W, frameH, dev.h);
      openLaid.push(l);
      if (o === extra) overlay = l;
    }

    const f: Frame = {
      key,
      screen: s,
      open: openLaid,
      title: this.frameTitle(s),
      x: 0,
      y: 0,
      w: W,
      h: frameH,
      deviceH: dev.h,
      sidebars,
      body: body.children,
      notes: [],
      notesW: 0,
      notesH: 0,
    };
    if (header) f.header = header;
    if (footer) f.footer = footer;
    if (overlay) f.overlay = overlay;
    return f;
  }

  frameTitle(s: Node): string {
    const state = textOf(s.attrs?.state);
    const of = s.attrs?.of;
    const isVariant = typeof of === 'object' && of !== null && !Array.isArray(of);
    return isVariant && state !== undefined ? `${s.label ?? ''} (${state})` : (s.label ?? '');
  }

  placeOverlay(o: Node, W: number, frameH: number, deviceH: number): Laid {
    const u = this.u;
    const p = 6 * u;
    const kids = this.flowChildren(o);
    if (o.type === 'modal') {
      const want = num(o.attrs?.width) ?? 480;
      const w = Math.min(want, W - 8 * u);
      const x = r((W - w) / 2);
      const inner = this.placeColumn(o, kids, x + p, 0, w - 2 * p, 4 * u, 'stretch', undefined);
      const h = p + 24 + (kids.length > 0 ? 4 * u + inner.h : 0) + p;
      const y = Math.max(4 * u, r((deviceH - h) / 2));
      const placed = this.placeColumn(
        o,
        kids,
        x + p,
        y + p + 24 + 4 * u,
        w - 2 * p,
        4 * u,
        'stretch',
        undefined,
      );
      const l = this.laid(o, x, y, w, h);
      l.children = placed.children;
      return l;
    }
    const bottom = has(o, 'bottom');
    const isLeft = has(o, 'left') && !has(o, 'right');
    let box: Box;
    if (bottom) {
      const h = r(deviceH * 0.5);
      box = { x: 0, y: r(frameH - h), w: W, h };
    } else {
      const w = Math.min(num(o.attrs?.width) ?? 360, W);
      box = { x: isLeft ? 0 : r(W - w), y: 0, w, h: frameH };
    }
    const placed = this.placeColumn(
      o,
      kids,
      box.x + p,
      box.y + p + 24 + 4 * u,
      box.w - 2 * p,
      4 * u,
      'stretch',
      undefined,
    );
    const l = this.laid(o, box.x, box.y, box.w, box.h);
    l.children = placed.children;
    return l;
  }
}

/** Shares room equally: each share rounded, the last takes what is left (section 10.1). */
export function share(room: number, n: number): number[] {
  const out: number[] = [];
  let left = room;
  for (let i = 0; i < n; i++) {
    const s = i === n - 1 ? r(left) : r(room / n);
    out.push(s);
    left -= s;
  }
  return out;
}

function justifyOffsets(j: string, free: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (j === 'center') out.push(r(free / 2));
    else if (j === 'end') out.push(free);
    else if (j === 'between' && n > 1) out.push(r((free * i) / (n - 1)));
    else out.push(0);
  }
  return out;
}

/** Moves everything under a laid-out element. */
export function shiftChildren(l: Laid, dx: number, dy: number): void {
  for (const c of l.children) {
    c.box.x = r(c.box.x + dx);
    c.box.y = r(c.box.y + dy);
    shiftChildren(c, dx, dy);
  }
  for (const e of l.entries ?? []) {
    e.box.x = r(e.box.x + dx);
    e.box.y = r(e.box.y + dy);
  }
  if (l.tableTop !== undefined) l.tableTop = r(l.tableTop + dy);
}
