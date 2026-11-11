// SPDX-License-Identifier: MIT

// The renderer (spec section 12 and Appendix C): draws the overview as one SVG document.

import { ICON_DRAWINGS, ICON_NAMES } from './data/icons.js';
import type { Box, Laid, Layout } from './layout.js';
import { baseline, type Font, measure, r, truncate } from './measure.js';
import type { Arrow, Overview, PlacedFrame } from './overview.js';
import { SPEC_VERSION } from './parse.js';
import { el, fmt4, join, type Markup } from './svg.js';
import { COLOR_TOKENS, type Theme } from './theme.js';
import type { Node } from './types.js';
import { textOf } from './validate.js';

const FAMILY: Record<string, string> = {
  sans: 'Inter, sans-serif',
  serif: "'Source Serif 4', serif",
  mono: "'JetBrains Mono', monospace",
};

const has = (n: Node, f: string) => n.flags?.includes(f) ?? false;

export interface RenderInput {
  overview: Overview;
  theme: Theme;
  idPrefix: string;
  title: string;
  desc: string;
  source?: string;
}

class Painter {
  readonly t: Theme;
  readonly L: Layout;
  readonly u: number;
  readonly S: number;
  readonly R: number;
  readonly defs: Markup[] = [];
  /** The id prefix for elements in the frame being drawn. */
  scope = '';

  constructor(
    readonly input: RenderInput,
    readonly ids: (n: Node) => string,
  ) {
    this.t = input.theme;
    this.L = input.overview.layout;
    this.u = this.L.u;
    this.S = this.t.stroke;
    this.R = this.t.radius;
  }

  get c() {
    return this.t.color;
  }

  // ---- primitives ---------------------------------------------------------------------------

  /** One line of text whose line box starts at `top`. */
  text(s: string, x: number, top: number, f: Font, lh: number, fill: string): Markup {
    return el(
      'text',
      {
        x,
        y: r(top + baseline(f, lh)),
        'font-family': FAMILY[f.font],
        'font-size': f.size,
        'font-weight': f.weight,
        fill,
      },
      s,
    );
  }

  /** Text centred in a box, truncated to fit. */
  centred(s: string, box: Box, f: Font, lh: number, fill: string, pad = 0): Markup | undefined {
    const shown = truncate(s, f, box.w - 2 * pad);
    if (shown === '') return undefined;
    const w = measure(shown, f);
    return this.text(shown, r(box.x + (box.w - w) / 2), r(box.y + (box.h - lh) / 2), f, lh, fill);
  }

  outlined(b: Box, fill: string, stroke = this.c.border): Markup {
    return el('rect', {
      x: b.x,
      y: b.y,
      width: b.w,
      height: b.h,
      rx: this.R,
      fill,
      stroke,
      'stroke-width': this.S,
    });
  }

  bar(x: number, y: number, w: number): Markup {
    return el('rect', {
      x,
      y,
      width: Math.max(0, w),
      height: 8,
      rx: 4,
      fill: this.c.border,
      'fill-opacity': '0.35',
    });
  }

  hline(x1: number, x2: number, y: number, stroke = this.c.border): Markup {
    return el('line', { x1, y1: y, x2, y2: y, stroke, 'stroke-width': this.S });
  }

  vline(x: number, y1: number, y2: number, stroke = this.c.border): Markup {
    return el('line', { x1: x, y1, x2: x, y2, stroke, 'stroke-width': this.S });
  }

  /** An icon at (x, y), `size` pixels square (Appendix C.1). */
  icon(name: string, x: number, y: number, size: number, color: string): Markup {
    const k = size / 24;
    const drawing = Object.hasOwn(ICON_NAMES, name) ? ICON_DRAWINGS[ICON_NAMES[name] as string] : undefined;
    const parts: Markup[] = [];
    if (!drawing) {
      parts.push(el('rect', { x: 4, y: 4, width: 16, height: 16 }));
    } else {
      for (const [tag, a] of drawing) {
        const attrs: Record<string, string> = {};
        for (const [key, v] of Object.entries(a))
          attrs[key] = key === 'fill' && v === 'currentColor' ? color : v;
        parts.push(el(tag, attrs));
      }
    }
    return el(
      'g',
      {
        transform: `translate(${num(x)} ${num(y)}) scale(${fmt4(k)})`,
        fill: 'none',
        stroke: color,
        'stroke-width': fmt4(this.S / k),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
      },
      ...parts,
    );
  }

  /** A group for an element: its id and classes. */
  group(n: Node, parts: (Markup | undefined)[], titleText?: string): Markup {
    const cls = [`wl-${n.type}`, ...(n.flags ?? []).map((f) => `wl-${f}`)].join(' ');
    return el(
      'g',
      { id: this.ids(n), class: cls },
      titleText !== undefined ? el('title', {}, titleText) : undefined,
      ...parts,
    );
  }

  // ---- components ---------------------------------------------------------------------------

  draw(l: Laid): Markup {
    const n = l.node;
    const b = l.box;
    const u = this.u;
    const c = this.c;
    const L = this.L;
    const label = n.label ?? '';
    const kids = () => l.children.map((k) => this.draw(k));
    switch (n.type) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'text':
      case 'link': {
        const { f, lh } = L.textStyle(n.type);
        if (n.type === 'text' && n.label === undefined) {
          const count = Math.round(b.h / lh);
          const bars: Markup[] = [];
          for (let i = 0; i < count; i++) {
            bars.push(
              this.bar(
                b.x,
                r(b.y + i * lh + (lh - 8) / 2),
                i === count - 1 && count > 1 ? r(b.w * 0.6) : b.w,
              ),
            );
          }
          return this.group(n, [el('g', { 'aria-hidden': 'true' }, ...bars)]);
        }
        const disabled = has(n, 'disabled');
        const fill =
          n.type === 'link'
            ? disabled
              ? c.muted
              : c.primary
            : n.type === 'text' && has(n, 'muted')
              ? c.muted
              : c.text;
        const parts: Markup[] = [];
        (l.lines ?? []).forEach((line, i) => {
          const w = measure(line, f);
          const x = this.alignX(n, b, w);
          const top = r(b.y + i * lh);
          parts.push(this.text(line, x, top, f, lh, fill));
          if (n.type === 'link' && !disabled && line !== '') {
            const y = r(top + baseline(f, lh) + 2);
            parts.push(
              el('line', { x1: x, y1: y, x2: r(x + w), y2: y, stroke: c.primary, 'stroke-width': 1 }),
            );
          }
        });
        return this.group(n, parts);
      }
      case 'label': {
        const f = L.body(13, 500);
        const shown = truncate(label, f, b.w);
        return this.group(n, [
          shown ? this.text(shown, b.x, b.y, f, 18, has(n, 'muted') ? c.muted : c.text) : undefined,
        ]);
      }
      case 'button':
        return this.group(n, this.button(n, b));
      case 'input':
      case 'select':
      case 'textarea':
        return this.group(n, this.field(n, b));
      case 'checkbox':
      case 'toggle':
        return this.group(n, this.check(n, b));
      case 'radio':
        return this.group(n, this.radio(n, b));
      case 'icon': {
        const s = L.iconSize(n);
        return this.group(n, [this.icon(label, b.x, b.y, s, c.text)], label);
      }
      case 'avatar': {
        const s = L.avatarSize(n);
        const words = label.split(' ').filter((w) => w !== '');
        const firstChar = (w: string | undefined) => (w ? (Array.from(w)[0] ?? '') : '');
        const initials = (
          firstChar(words[0]) + (words.length > 1 ? firstChar(words[words.length - 1]) : '')
        ).replace(/[a-z]/g, (ch) => ch.toUpperCase());
        const f = L.body(s === 24 ? 10 : s === 48 ? 18 : 13, 600);
        const box = { x: b.x, y: b.y, w: s, h: s };
        return this.group(
          n,
          [
            el('circle', {
              cx: r(b.x + s / 2),
              cy: r(b.y + s / 2),
              r: r(s / 2),
              fill: c.bg,
              stroke: c.border,
              'stroke-width': this.S,
            }),
            initials ? this.centred(initials, box, f, s, c.text) : undefined,
          ],
          label,
        );
      }
      case 'badge':
        return this.group(n, this.badge(n, label, b.x, b.y));
      case 'image': {
        const f = L.body(13, 400);
        const shown = truncate(label, f, b.w - 4 * u);
        const parts: (Markup | undefined)[] = [
          this.outlined(b, c.bg),
          el(
            'g',
            { 'aria-hidden': 'true' },
            el('line', {
              x1: b.x,
              y1: b.y,
              x2: b.x + b.w,
              y2: b.y + b.h,
              stroke: c.border,
              'stroke-width': this.S,
            }),
            el('line', {
              x1: b.x,
              y1: b.y + b.h,
              x2: b.x + b.w,
              y2: b.y,
              stroke: c.border,
              'stroke-width': this.S,
            }),
          ),
        ];
        if (shown) {
          const w = measure(shown, f);
          const bx = r(b.x + (b.w - w - 2 * u) / 2);
          const by = r(b.y + (b.h - 18) / 2);
          parts.push(el('rect', { x: bx, y: by, width: w + 2 * u, height: 18, fill: c.bg }));
          parts.push(this.text(shown, r(bx + u), by, f, 18, c.muted));
        }
        return this.group(n, parts, label);
      }
      case 'spacer':
        return this.group(n, []);
      case 'divider': {
        const inRow = b.w <= this.S && b.h > this.S;
        const line = inRow
          ? this.vline(r(b.x + b.w / 2), b.y, b.y + b.h)
          : this.hline(b.x, b.x + b.w, r(b.y + b.h / 2));
        return this.group(n, [el('g', { 'aria-hidden': 'true' }, line)]);
      }
      case 'item':
        return this.group(n, this.item(n, b));
      case 'nav':
        return this.group(n, this.nav(l));
      case 'tabs':
        return this.group(n, [...this.tabs(l), ...kids()]);
      case 'breadcrumbs':
        return this.group(n, this.crumbs(n, b));
      case 'list':
        return this.group(n, l.entries ? this.listEntries(l) : kids());
      case 'table':
        return this.group(n, this.table(l));
      case 'card': {
        const p = L.pad(n);
        const parts: (Markup | undefined)[] = [this.outlined(b, c.surface)];
        if (n.label !== undefined) {
          const f = L.heading(15, 600);
          const shown = truncate(label, f, b.w - 2 * p);
          if (shown) parts.push(this.text(shown, b.x + p, b.y + p, f, 22, c.text));
        }
        return this.group(n, [...parts, ...kids()]);
      }
      case 'empty':
      case 'error':
      case 'loading':
        return this.group(n, [...this.state(l), ...kids()]);
      case 'header':
      case 'footer': {
        const y = n.type === 'header' ? b.y + b.h : b.y;
        return this.group(n, [el('g', { 'aria-hidden': 'true' }, this.hline(b.x, b.x + b.w, y)), ...kids()]);
      }
      case 'sidebar': {
        const parts: Markup[] = [el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: c.bg })];
        const right = has(n, 'right');
        parts.push(el('g', { 'aria-hidden': 'true' }, this.vline(right ? b.x : b.x + b.w, b.y, b.y + b.h)));
        return this.group(n, [...parts, ...kids()]);
      }
      case 'modal':
      case 'drawer':
        return this.group(n, this.overlay(l));
      case 'swatches':
        return this.group(n, this.swatches(b));
      default:
        return this.group(n, kids());
    }
  }

  alignX(n: Node, b: Box, w: number): number {
    const a = n.attrs?.align;
    if (a === 'center') return r(b.x + (b.w - w) / 2);
    if (a === 'end') return r(b.x + b.w - w);
    return b.x;
  }

  button(n: Node, b: Box): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const h = this.L.buttonHeight(n);
    const box = { x: b.x, y: b.y, w: b.w, h };
    const disabled = has(n, 'disabled');
    let fill = c.surface;
    let stroke = c.border;
    let ink = c.text;
    if (disabled) {
      fill = c.bg;
      ink = c.muted;
    } else if (has(n, 'primary')) {
      fill = c.primary;
      stroke = c.primary;
      ink = c.onPrimary;
    } else if (has(n, 'danger')) {
      fill = c.danger;
      stroke = c.danger;
      ink = c.onPrimary;
    }
    const parts: (Markup | undefined)[] = [this.outlined(box, fill, stroke)];
    const icon = textOf(n.attrs?.icon);
    const iconSize = has(n, 'lg') ? 20 : 16;
    const f = this.L.body(15, 600);
    if (icon !== undefined && n.label === undefined) {
      parts.push(this.icon(icon, r(b.x + (b.w - iconSize) / 2), r(b.y + (h - iconSize) / 2), iconSize, ink));
      return parts;
    }
    const iconW = icon !== undefined ? iconSize + 2 * u : 0;
    const shown = truncate(n.label ?? '', f, b.w - 8 * u - iconW);
    const w = iconW + measure(shown, f);
    const x0 = r(b.x + (b.w - w) / 2);
    if (icon !== undefined) parts.push(this.icon(icon, x0, r(b.y + (h - iconSize) / 2), iconSize, ink));
    if (shown) parts.push(this.text(shown, r(x0 + iconW), r(b.y + (h - 22) / 2), f, 22, ink));
    return parts;
  }

  fieldLabel(n: Node, b: Box): (Markup | undefined)[] {
    if (n.label === undefined) return [];
    const f = this.L.body(13, 500);
    const req = has(n, 'required');
    const shown = truncate(n.label, f, b.w - (req ? measure(' *', f) : 0));
    const top = b.y;
    const y = r(top + baseline(f, 18));
    return [
      el(
        'text',
        {
          x: b.x,
          y,
          'font-family': FAMILY[f.font],
          'font-size': f.size,
          'font-weight': f.weight,
          fill: this.c.text,
        },
        shown,
        req ? el('tspan', { fill: this.c.danger }, ' *') : undefined,
      ),
    ];
  }

  field(n: Node, b: Box): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const parts = this.fieldLabel(n, b);
    const top = n.label !== undefined ? b.y + 18 + u : b.y;
    const rows =
      typeof n.attrs?.rows === 'number' &&
      Number.isInteger(n.attrs.rows) &&
      n.attrs.rows >= 1 &&
      n.attrs.rows <= 100
        ? n.attrs.rows
        : 3;
    const h = n.type === 'textarea' ? rows * 22 + 4 * u : 10 * u;
    const box = { x: b.x, y: r(top), w: b.w, h };
    const disabled = has(n, 'disabled');
    const error = textOf(n.attrs?.error);
    parts.push(this.outlined(box, disabled ? c.bg : c.surface, error !== undefined ? c.danger : c.border));
    const type = textOf(n.attrs?.type);
    let left = box.x + 3 * u;
    let right = box.x + box.w - 3 * u;
    const iconY = r(box.y + (Math.min(h, 10 * u) - 16) / 2);
    if (n.type === 'input' && type === 'search') {
      parts.push(this.icon('search', left, iconY, 16, c.muted));
      left += 16 + 2 * u;
    } else if (n.type === 'input' && type === 'date') {
      parts.push(this.icon('calendar', right - 16, iconY, 16, c.muted));
      right -= 16 + 2 * u;
    } else if (n.type === 'select') {
      parts.push(this.icon('chevron-down', right - 16, iconY, 16, c.muted));
      right -= 16 + 2 * u;
    }
    const value = textOf(n.attrs?.value);
    const placeholder = textOf(n.attrs?.placeholder);
    let shown: string | undefined;
    let ink = disabled ? c.muted : c.text;
    if (value !== undefined)
      shown = n.type === 'input' && type === 'password' ? '•'.repeat(Array.from(value).length) : value;
    else if (placeholder !== undefined) {
      shown = placeholder;
      ink = c.muted;
    }
    const f = this.L.body(15, 400);
    if (shown !== undefined) {
      if (n.type === 'textarea') {
        let y = box.y + 2 * u;
        for (const line of this.L.wrapText(shown, f, right - left)) {
          if (y + 22 > box.y + box.h) break;
          parts.push(this.text(line, r(left), r(y), f, 22, ink));
          y += 22;
        }
      } else {
        const cut = truncate(shown, f, right - left);
        if (cut) parts.push(this.text(cut, r(left), r(box.y + (h - 22) / 2), f, 22, ink));
      }
    }
    if (error !== undefined) {
      const ef = this.L.body(13, 400);
      const cut = truncate(error, ef, b.w);
      if (cut) parts.push(this.text(cut, b.x, r(box.y + h + u), ef, 18, c.danger));
    }
    return parts;
  }

  check(n: Node, b: Box): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const h = 6 * u;
    const disabled = has(n, 'disabled');
    const parts: (Markup | undefined)[] = [];
    let markW = 16;
    if (n.type === 'checkbox') {
      const checked = has(n, 'checked');
      const y = r(b.y + (h - 16) / 2);
      parts.push(
        el('rect', {
          x: b.x,
          y,
          width: 16,
          height: 16,
          rx: Math.min(this.R, 4),
          fill: checked ? c.primary : disabled ? c.bg : c.surface,
          stroke: checked ? c.primary : c.border,
          'stroke-width': this.S,
        }),
      );
      if (checked) parts.push(this.icon('check', b.x, y, 16, c.onPrimary));
    } else {
      markW = 36;
      const on = has(n, 'on');
      const y = r(b.y + (h - 20) / 2);
      parts.push(
        el('rect', {
          x: b.x,
          y,
          width: 36,
          height: 20,
          rx: 10,
          fill: on ? c.primary : c.bg,
          stroke: on ? c.primary : c.border,
          'stroke-width': this.S,
        }),
      );
      parts.push(
        on
          ? el('circle', { cx: b.x + 26, cy: r(y + 10), r: 8, fill: c.onPrimary })
          : el('circle', {
              cx: b.x + 10,
              cy: r(y + 10),
              r: 8,
              fill: c.surface,
              stroke: c.border,
              'stroke-width': this.S,
            }),
      );
    }
    const f = this.L.body(15, 400);
    const x = b.x + markW + 2 * u;
    const shown = truncate(n.label ?? '', f, Math.max(0, b.w - markW - 2 * u));
    if (shown) parts.push(this.text(shown, x, r(b.y + (h - 22) / 2), f, 22, disabled ? c.muted : c.text));
    return parts;
  }

  radio(n: Node, b: Box): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const parts = this.fieldLabel(n, b);
    let y = n.label !== undefined ? b.y + 18 + u : b.y;
    const value = textOf(n.attrs?.value);
    const disabled = has(n, 'disabled');
    const f = this.L.body(15, 400);
    for (const opt of n.items ?? []) {
      const cy = r(y + 3 * u);
      parts.push(
        el('circle', {
          cx: b.x + 8,
          cy,
          r: 8,
          fill: disabled ? c.bg : c.surface,
          stroke: c.border,
          'stroke-width': this.S,
        }),
      );
      if (opt === value) parts.push(el('circle', { cx: b.x + 8, cy, r: 4, fill: c.primary }));
      const shown = truncate(opt, f, Math.max(0, b.w - 16 - 2 * u));
      if (shown)
        parts.push(
          this.text(shown, b.x + 16 + 2 * u, r(y + (6 * u - 22) / 2), f, 22, disabled ? c.muted : c.text),
        );
      y += 6 * u;
    }
    return parts;
  }

  badge(n: Node | undefined, label: string, x: number, y: number): Markup[] {
    const u = this.u;
    const c = this.c;
    const f = this.L.body(13, 500);
    const w = measure(label, f) + 4 * u;
    let fill = c.bg;
    let stroke: string | undefined = c.border;
    let ink = c.text;
    for (const k of ['primary', 'success', 'danger'] as const) {
      if (n && has(n, k)) {
        fill = k === 'primary' ? c.primary : k === 'success' ? c.success : c.danger;
        stroke = undefined;
        ink = c.onPrimary;
      }
    }
    const parts: Markup[] = [
      el('rect', {
        x,
        y,
        width: w,
        height: 20,
        rx: 10,
        fill,
        stroke,
        'stroke-width': stroke ? this.S : undefined,
      }),
    ];
    if (label !== '') parts.push(this.text(label, r(x + 2 * u), r(y + 1), f, 18, ink));
    return parts;
  }

  item(n: Node, b: Box): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const active = has(n, 'active');
    const parts: (Markup | undefined)[] = [];
    if (active) parts.push(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: this.R, fill: c.bg }));
    let x = b.x + 3 * u;
    const icon = textOf(n.attrs?.icon);
    if (icon !== undefined) {
      parts.push(this.icon(icon, x, r(b.y + (b.h - 16) / 2), 16, c.text));
      x += 16 + 2 * u;
    }
    const badge = textOf(n.attrs?.badge);
    const badgeW = badge !== undefined ? measure(badge, this.L.body(13, 500)) + 4 * u : 0;
    const right = b.x + b.w - 3 * u - (badge !== undefined ? badgeW + 2 * u : 0);
    const f = this.L.body(15, active ? 600 : 400);
    const shown = truncate(n.label ?? '', f, Math.max(0, right - x));
    if (shown) parts.push(this.text(shown, r(x), r(b.y + (b.h - 22) / 2), f, 22, c.text));
    if (badge !== undefined)
      parts.push(...this.badge(undefined, badge, r(b.x + b.w - 3 * u - badgeW), r(b.y + (b.h - 20) / 2)));
    return parts;
  }

  nav(l: Laid): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const vertical = has(l.node, 'vertical');
    const parts: (Markup | undefined)[] = [];
    for (const e of l.entries ?? []) {
      const f = this.L.body(15, e.active ? 600 : 400);
      const eb = e.box;
      if (vertical && e.active)
        parts.push(el('rect', { x: eb.x, y: eb.y, width: eb.w, height: eb.h, rx: this.R, fill: c.bg }));
      let x = vertical ? eb.x + 3 * u : eb.x;
      if (e.icon !== undefined) {
        parts.push(this.icon(e.icon, x, r(eb.y + (eb.h - 16) / 2), 16, c.text));
        x += 16 + 2 * u;
      }
      const room = vertical ? eb.x + eb.w - 3 * u - x : eb.x + eb.w - x;
      const shown = truncate(e.text, f, Math.max(0, room));
      if (shown) parts.push(this.text(shown, r(x), r(eb.y + (eb.h - 22) / 2), f, 22, c.text));
      if (!vertical && e.active) {
        parts.push(
          el('rect', {
            x: r(x),
            y: r(eb.y + eb.h - 2),
            width: measure(shown, f),
            height: 2,
            fill: c.primary,
          }),
        );
      }
    }
    for (const k of l.children) parts.push(this.group(k.node, []));
    return parts;
  }

  tabs(l: Laid): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const b = l.box;
    const strip = 10 * u;
    const parts: (Markup | undefined)[] = [
      el('g', { 'aria-hidden': 'true' }, this.hline(b.x, b.x + b.w, b.y + strip)),
    ];
    for (const e of l.entries ?? []) {
      const f = this.L.body(15, e.active ? 600 : 400);
      parts.push(
        this.centred(
          e.text,
          { x: e.box.x, y: e.box.y, w: e.box.w, h: strip },
          f,
          22,
          e.active ? c.text : c.muted,
          4 * u,
        ),
      );
      if (e.active)
        parts.push(
          el('rect', { x: e.box.x, y: r(b.y + strip - 2), width: e.box.w, height: 2, fill: c.primary }),
        );
    }
    return parts;
  }

  crumbs(n: Node, b: Box): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const items = n.items ?? [];
    const parts: (Markup | undefined)[] = [];
    let x = b.x;
    items.forEach((it, i) => {
      const last = i === items.length - 1;
      if (i > 0) {
        parts.push(this.icon('chevron-right', r(x + u), r(b.y + (b.h - 16) / 2), 16, c.muted));
        x += 16 + 2 * u;
      }
      const f = this.L.body(15, last ? 500 : 400);
      const shown = truncate(it, f, Math.max(0, b.x + b.w - x));
      if (shown) parts.push(this.text(shown, r(x), r(b.y + (b.h - 22) / 2), f, 22, last ? c.text : c.muted));
      x += measure(shown, f);
    });
    return parts;
  }

  listEntries(l: Laid): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const ordered = has(l.node, 'ordered');
    const f = this.L.body(15, 400);
    const parts: (Markup | undefined)[] = [];
    (l.entries ?? []).forEach((e, i) => {
      const top = r(e.box.y + (e.box.h - 22) / 2);
      if (ordered) parts.push(this.text(`${i + 1}.`, e.box.x, top, f, 22, c.muted));
      else
        parts.push(
          el('circle', { cx: r(e.box.x + 2 * u), cy: r(e.box.y + e.box.h / 2), r: 2.5, fill: c.text }),
        );
      const shown = truncate(e.text, f, Math.max(0, e.box.w - 5 * u));
      if (shown) parts.push(this.text(shown, r(e.box.x + 5 * u), top, f, 22, c.text));
    });
    return parts;
  }

  table(l: Laid): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const n = l.node;
    const b = l.box;
    const parts: (Markup | undefined)[] = [];
    if (n.label !== undefined) {
      const f = this.L.heading(15, 600);
      const shown = truncate(n.label, f, b.w);
      if (shown) parts.push(this.text(shown, b.x, b.y, f, 22, c.text));
    }
    const top = l.tableTop ?? b.y;
    const box = { x: b.x, y: top, w: b.w, h: r(b.y + b.h - top) };
    const clipId = `${this.ids(n)}-clip`;
    this.defs.push(
      el(
        'clipPath',
        { id: clipId },
        el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: this.R }),
      ),
    );
    const inner: (Markup | undefined)[] = [
      el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: c.surface }),
    ];
    const rowH = 10 * u;
    inner.push(el('rect', { x: box.x, y: box.y, width: box.w, height: rowH, fill: c.bg }));
    const cols = l.columns ?? [0];
    const colW = (i: number) => (cols[i + 1] ?? box.w) - (cols[i] ?? 0);
    const cell = (text: string, i: number, y: number, f: Font, ink: string) => {
      const shown = truncate(text, f, Math.max(0, colW(i) - 6 * u));
      return shown
        ? this.text(shown, r(box.x + (cols[i] ?? 0) + 3 * u), r(y + (rowH - 22) / 2), f, 22, ink)
        : undefined;
    };
    for (const [i, h] of (n.items ?? []).entries())
      inner.push(cell(h, i, box.y, this.L.body(14, 600), c.text));
    const rows = Math.round(box.h / rowH) - 1;
    const rowNodes = l.children;
    for (let k = 0; k < rows; k++) {
      const y = r(box.y + rowH * (k + 1));
      inner.push(this.hline(box.x, box.x + box.w, y));
      const rn = rowNodes[k];
      if (rn) {
        const cells: (Markup | undefined)[] = [];
        if (has(rn.node, 'selected')) {
          cells.push(el('rect', { x: box.x, y, width: box.w, height: rowH, fill: c.bg }));
          cells.push(el('rect', { x: box.x, y, width: 3, height: rowH, fill: c.primary }));
        }
        for (let i = 0; i < cols.length; i++) {
          cells.push(cell(rn.node.items?.[i] ?? '', i, y, this.L.body(14, 400), c.text));
        }
        inner.push(this.group(rn.node, cells));
      } else {
        for (let i = 0; i < cols.length; i++) {
          inner.push(
            this.bar(r(box.x + (cols[i] ?? 0) + 3 * u), r(y + (rowH - 8) / 2), r((colW(i) - 6 * u) * 0.6)),
          );
        }
      }
    }
    parts.push(el('g', { 'clip-path': `url(#${clipId})` }, ...inner));
    parts.push(
      el('rect', {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rx: this.R,
        fill: 'none',
        stroke: c.border,
        'stroke-width': this.S,
      }),
    );
    return parts;
  }

  state(l: Laid): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const n = l.node;
    const b = l.box;
    const parts: (Markup | undefined)[] = [];
    let y = b.y + 8 * u;
    const cx = b.x + b.w / 2;
    if (n.type === 'loading') {
      const cy = r(y + 12);
      parts.push(
        el(
          'g',
          { 'aria-hidden': 'true' },
          el('circle', { cx: r(cx), cy, r: 12, fill: 'none', stroke: c.border, 'stroke-width': this.S }),
          el('path', {
            d: `M${num(r(cx))} ${num(cy - 12)}A12 12 0 0 1 ${num(r(cx + 12))} ${num(cy)}`,
            fill: 'none',
            stroke: c.primary,
            'stroke-width': this.S,
            'stroke-linecap': 'round',
          }),
        ),
      );
      y += 24;
    } else {
      parts.push(
        this.icon(
          n.type === 'error' ? 'triangle-alert' : 'inbox',
          r(cx - 16),
          r(y),
          32,
          n.type === 'error' ? c.danger : c.muted,
        ),
      );
      y += 32;
    }
    if (l.lines) {
      y += 2 * u;
      const f = this.L.body(15, 400);
      for (const line of l.lines) {
        const w = measure(line, f);
        parts.push(this.text(line, r(cx - w / 2), r(y), f, 22, n.type === 'error' ? c.text : c.muted));
        y += 22;
      }
    }
    return parts;
  }

  overlay(l: Laid): (Markup | undefined)[] {
    const u = this.u;
    const c = this.c;
    const n = l.node;
    const b = l.box;
    const p = 6 * u;
    const parts: (Markup | undefined)[] = [];
    if (n.type === 'modal') parts.push(this.outlined(b, c.surface));
    else {
      parts.push(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: c.surface }));
      const bottom = has(n, 'bottom');
      const left = has(n, 'left') && !has(n, 'right');
      const edge = bottom
        ? this.hline(b.x, b.x + b.w, b.y)
        : this.vline(left ? b.x + b.w : b.x, b.y, b.y + b.h);
      parts.push(el('g', { 'aria-hidden': 'true' }, edge));
    }
    const f = this.L.heading(18, 600);
    const shown = truncate(n.label ?? '', f, b.w - 2 * p - 20 - 2 * u);
    if (shown) parts.push(this.text(shown, b.x + p, b.y + p, f, 24, c.text));
    parts.push(this.icon('x', r(b.x + b.w - p - 20), r(b.y + p + 2), 20, c.muted));
    for (const k of l.children) parts.push(this.draw(k));
    return parts;
  }

  swatches(b: Box): Markup[] {
    const u = this.u;
    const c = this.c;
    const gap = 4 * u;
    const cols = 3;
    const colW = (b.w - gap * (cols - 1)) / cols;
    const values = [c.bg, c.surface, c.border, c.text, c.muted, c.primary, c.onPrimary, c.danger, c.success];
    const parts: Markup[] = [];
    COLOR_TOKENS.forEach((token, i) => {
      const x = r(b.x + (i % cols) * (colW + gap));
      const y = r(b.y + Math.floor(i / cols) * (36 + gap));
      const value = values[i] ?? '#000000';
      parts.push(
        el('rect', {
          x,
          y: r(y + 6),
          width: 40,
          height: 24,
          rx: this.R,
          fill: value,
          stroke: c.border,
          'stroke-width': this.S,
        }),
      );
      parts.push(this.text(token, x + 40 + 2 * u, y, this.L.body(13, 500), 18, c.text));
      parts.push(this.text(value, x + 40 + 2 * u, y + 18, this.L.body(13, 400), 18, c.muted));
    });
    return parts;
  }

  // ---- frames ---------------------------------------------------------------------------------

  frame(f: PlacedFrame, alone: boolean): Markup {
    const c = this.c;
    const frameId = `${this.input.idPrefix}-${f.key}`;
    const isExtra = f.overlay !== undefined;
    this.scope = isExtra ? `${f.key}-` : '';
    const clipId = `${frameId}-clip`;
    this.defs.push(
      el('clipPath', { id: clipId }, el('rect', { x: 0, y: 0, width: f.w, height: f.h, rx: this.R })),
    );
    const inner: (Markup | undefined)[] = [];
    const s = f.screen;
    // Source order among the screen's direct children; overlays last.
    const byNode = new Map<Node, Laid>();
    if (f.header) byNode.set(f.header.node, f.header);
    if (f.footer) byNode.set(f.footer.node, f.footer);
    for (const l of f.sidebars) byNode.set(l.node, l);
    for (const l of f.body) byNode.set(l.node, l);
    for (const k of s.children ?? []) {
      const l = byNode.get(k);
      if (l) inner.push(this.draw(l));
    }
    if (f.open.length > 0) {
      inner.push(
        el('rect', { x: 0, y: 0, width: f.w, height: f.h, rx: this.R, fill: c.text, 'fill-opacity': '0.4' }),
      );
      for (const o of f.open) inner.push(this.draw(o));
    }
    const parts: (Markup | undefined)[] = [el('title', {}, f.title)];
    if (!alone) {
      const tf = this.L.heading(15, 600);
      const shown = truncate(f.title, tf, f.w);
      if (shown) parts.push(this.text(shown, 0, -32, tf, 24, c.text));
    }
    parts.push(el('rect', { x: 0, y: 0, width: f.w, height: f.h, rx: this.R, fill: c.surface }));
    parts.push(el('g', { 'clip-path': `url(#${clipId})` }, ...inner));
    parts.push(
      el('rect', {
        x: 0,
        y: 0,
        width: f.w,
        height: f.h,
        rx: this.R,
        fill: 'none',
        stroke: c.border,
        'stroke-width': this.S,
      }),
    );
    for (const m of f.markers) parts.push(this.marker(m.number, m.x, m.y));
    const g = el(
      'g',
      { id: frameId, class: 'wl-screen', transform: `translate(${num(f.x)} ${num(f.y)})` },
      ...parts,
    );
    this.scope = '';
    return g;
  }

  marker(number: number, x: number, y: number): Markup {
    const box = { x: r(x - 9), y: r(y - 9), w: 18, h: 18 };
    return el(
      'g',
      { class: 'wl-marker', 'aria-hidden': 'true' },
      el('circle', { cx: r(x), cy: r(y), r: 9, fill: this.c.primary }),
      this.centred(String(number), box, this.L.body(12, 600), 18, this.c.onPrimary),
    );
  }

  notes(f: PlacedFrame): Markup | undefined {
    if (f.notesList.length === 0) return undefined;
    const u = this.u;
    const c = this.c;
    const x = f.x + f.w + 24;
    let y = f.y;
    const parts: Markup[] = [this.text('Notes', x, y, this.L.body(13, 600), 18, c.muted)];
    y += 18 + 2 * u;
    const font = this.L.body(13, 400);
    for (const n of f.notesList) {
      parts.push(this.marker(n.number, x + 9, y + 9));
      for (const [i, line] of n.lines.entries())
        parts.push(this.text(line, x + 24, y + i * 18, font, 18, c.text));
      y += n.lines.length * 18 + 2 * u;
    }
    return el('g', { id: `${this.input.idPrefix}-${f.key}-notes`, class: 'wl-notes' }, ...parts);
  }

  arrow(a: Arrow, markerId: string): Markup {
    const c = this.c;
    const d = a.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p[0])} ${num(p[1])}`).join('');
    const parts: (Markup | undefined)[] = [
      el('path', {
        d,
        fill: 'none',
        stroke: c.muted,
        'stroke-width': this.S,
        'stroke-linejoin': 'round',
        'marker-end': `url(#${markerId})`,
      }),
    ];
    if (a.label !== undefined && a.label !== '') {
      const f = this.L.body(13, 500);
      const label = a.label.replace(/\n/g, ' ');
      const w = measure(label, f) + 2 * this.u;
      const x = r(a.mid[0] - w / 2);
      const y = r(a.mid[1] - 9);
      parts.push(el('rect', { x, y, width: w, height: 18, rx: 3, fill: c.bg }));
      parts.push(this.text(label, r(x + this.u), y, f, 18, c.text));
    }
    return el('g', { class: 'wl-arrow' }, ...parts);
  }
}

function num(n: number): string {
  const v = Math.round(n * 10) / 10;
  if (v === 0) return '0';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Draws the overview as an SVG document. */
export function paint(input: RenderInput): string {
  const { overview: ov, idPrefix } = input;
  const L = ov.layout;
  const painter: Painter = new Painter(
    input,
    (n: Node) => `${idPrefix}-${painter.scope}${n.id ?? `n${L.index.get(n) ?? 0}`}`,
  );
  const body: Markup[] = [];
  body.push(el('rect', { x: 0, y: 0, width: ov.width, height: ov.height, fill: input.theme.color.bg }));
  for (const f of ov.frames) body.push(painter.frame(f, ov.alone));
  for (const f of ov.frames) {
    const notes = painter.notes(f);
    if (notes) body.push(notes);
  }
  const markerId = `${idPrefix}-arrow`;
  if (ov.arrows.length > 0) {
    painter.defs.push(
      el(
        'marker',
        {
          id: markerId,
          markerWidth: 8,
          markerHeight: 8,
          refX: 7,
          refY: 4,
          orient: 'auto',
          markerUnits: 'userSpaceOnUse',
        },
        el('path', { d: 'M0 0L8 4L0 8Z', fill: input.theme.color.muted }),
      ),
    );
    for (const a of ov.arrows) body.push(painter.arrow(a, markerId));
  }
  const head: (Markup | undefined)[] = [
    el('title', { id: `${idPrefix}-title` }, input.title),
    el('desc', { id: `${idPrefix}-desc` }, input.desc),
  ];
  if (input.source !== undefined) {
    head.push(
      el(
        'metadata',
        {},
        el('wl:source', { 'xmlns:wl': 'urn:wirelith:source', version: SPEC_VERSION }, input.source),
      ),
    );
  }
  if (painter.defs.length > 0) head.push(el('defs', {}, ...painter.defs));
  const svg = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: ov.width,
      height: ov.height,
      viewBox: `0 0 ${num(ov.width)} ${num(ov.height)}`,
      role: 'img',
      'aria-labelledby': `${idPrefix}-title ${idPrefix}-desc`,
      'xml:space': 'preserve',
    },
    ...head,
    join(body),
  );
  return `${svg.value}\n`;
}
