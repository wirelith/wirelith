// SPDX-License-Identifier: MIT

// The overview (spec sections 6, 7.4 and 10.6): frames placed in groups, notes beside them, and
// arrows routed through the gaps between frames.

import { OVERLAYS } from './components.js';
import { type Box, type Frame, type Laid, Layout } from './layout.js';
import { r, wrap } from './measure.js';
import type { Theme } from './theme.js';
import type { Document, Node, Options } from './types.js';
import { walk } from './validate.js';

export interface Marker {
  number: number;
  x: number;
  y: number;
}

export interface NoteEntry {
  number: number;
  lines: string[];
}

export interface PlacedFrame extends Frame {
  markers: Marker[];
  notesList: NoteEntry[];
}

export interface Arrow {
  points: [number, number][];
  label?: string;
  mid: [number, number];
}

export interface Overview {
  frames: PlacedFrame[];
  arrows: Arrow[];
  width: number;
  height: number;
  alone: boolean;
  layout: Layout;
  /** How many links the source has, for the description. */
  linkCount: number;
}

const MARGIN = 32;
const TITLE = 32;
const H_GAP = 96;
const V_GAP = 64;
const NOTES_GAP = 24;
const NOTES_W = 240;
const LANE = 12;

const isVariant = (s: Node) => {
  const of = s.attrs?.of;
  return typeof of === 'object' && of !== null && !Array.isArray(of);
};
const has = (n: Node, f: string) => n.flags?.includes(f) ?? false;

/** Every laid-out element in a frame, with its box. */
export function frameElements(f: Frame): Laid[] {
  const out: Laid[] = [];
  const visit = (l: Laid) => {
    out.push(l);
    for (const c of l.children) visit(c);
  };
  if (f.header) visit(f.header);
  if (f.footer) visit(f.footer);
  for (const s of f.sidebars) visit(s);
  for (const b of f.body) visit(b);
  for (const o of f.open) visit(o);
  return out;
}

export function buildOverview(doc: Document, theme: Theme, opts: Options): Overview {
  const layout = new Layout(doc, theme);
  const u = layout.u;
  const all = walk(doc);
  const showNotes = opts.notes !== false;
  const showFlows = opts.flows !== false;
  const keyOf = (n: Node) => n.id ?? `n${layout.index.get(n) ?? 0}`;

  // Which overlays are link targets.
  const linkedOverlays = new Set<string>();
  for (const w of all) if (w.node.link) linkedOverlays.add(w.node.link.to);
  const overlaysOf = (s: Node) => (s.children ?? []).filter((c) => OVERLAYS.has(c.type));

  const baseFrame = new Map<Node, PlacedFrame>();
  const extraFrame = new Map<Node, PlacedFrame>();
  const decorate = (f: Frame): PlacedFrame => ({ ...f, markers: [], notesList: [] });

  // One screen or overlay, chosen by the host.
  let groups: PlacedFrame[][][] = [];
  let alone = false;
  if (opts.screen !== undefined) {
    const target = all.find((w) => w.node.id === opts.screen);
    if (!target || (target.node.type !== 'screen' && !OVERLAYS.has(target.node.type))) {
      throw new Error(
        `The screen option names "${opts.screen}", which is not a screen, modal or drawer in this source`,
      );
    }
    const s = target.screen;
    const open = overlaysOf(s).filter((o) => has(o, 'open'));
    let f: PlacedFrame;
    if (target.node.type === 'screen') {
      f = decorate(layout.frame(s, keyOf(s), open));
      baseFrame.set(s, f);
    } else {
      const o = target.node;
      f = decorate(layout.frame(s, `${keyOf(o)}-frame`, open.includes(o) ? open : [...open, o], o));
      extraFrame.set(o, f);
    }
    groups = [[[f]]];
    alone = true;
  } else {
    const byId = new Map(doc.screens.filter((s) => s.id).map((s) => [s.id as string, s]));
    const rowOf = new Map<Node, PlacedFrame[]>();
    for (const s of doc.screens) {
      const open = overlaysOf(s).filter((o) => has(o, 'open'));
      const base = decorate(layout.frame(s, keyOf(s), open));
      baseFrame.set(s, base);
      const row: PlacedFrame[] = [base];
      for (const o of overlaysOf(s)) {
        if (has(o, 'open') || o.id === undefined || !linkedOverlays.has(o.id)) continue;
        const ef = decorate(layout.frame(s, `${keyOf(o)}-frame`, [...open, o], o));
        extraFrame.set(o, ef);
        row.push(ef);
      }
      rowOf.set(s, row);
    }
    const baseOf = (s: Node) => {
      const of = s.attrs?.of;
      return isVariant(s) && typeof of === 'object' && !Array.isArray(of) ? byId.get(of.ref) : undefined;
    };
    // Every screen that is not a variant starts a group, in source order. Then each variant
    // joins its base's group, in source order, wherever it is written.
    const groupOf = new Map<Node, PlacedFrame[][]>();
    for (const s of doc.screens) {
      if (baseOf(s)) continue;
      const g = [rowOf.get(s) as PlacedFrame[]];
      groups.push(g);
      groupOf.set(s, g);
    }
    for (const s of doc.screens) {
      const b = baseOf(s);
      if (!b) continue;
      const g = groupOf.get(b);
      if (g) g.push(rowOf.get(s) as PlacedFrame[]);
      else groups.push([rowOf.get(s) as PlacedFrame[]]);
    }
    const frameCount = groups.reduce((n, g) => n + g.reduce((m, rw) => m + rw.length, 0), 0);
    const anyLink = all.some((w) => w.node.link) || (doc.flows?.length ?? 0) > 0;
    alone = doc.screens.length === 1 && frameCount === 1 && !anyLink;
  }

  // Notes: a list beside each base frame, and markers wherever their target is drawn.
  if (showNotes) {
    for (const s of doc.screens) {
      const notes = (s.children ?? []).filter((c) => c.type === 'note');
      if (notes.length === 0) continue;
      const base = baseFrame.get(s);
      const font = layout.body(13, 400);
      notes.forEach((note, i) => {
        const number = i + 1;
        const f = note.attrs?.for;
        const ref = typeof f === 'object' && f !== null && !Array.isArray(f) ? f.ref : undefined;
        for (const frame of [base, ...overlaysOf(s).map((o) => extraFrame.get(o))]) {
          if (!frame) continue;
          if (ref === undefined) {
            if (frame === base) frame.markers.push({ number, x: frame.w, y: 0 });
            continue;
          }
          const scope = frame === base ? frameElements(frame) : frame.overlay ? collect(frame.overlay) : [];
          const target = scope.find((l) => l.node.id === ref);
          if (target) frame.markers.push({ number, x: target.box.x + target.box.w, y: target.box.y });
        }
        if (base) base.notesList.push({ number, lines: wrap(note.label ?? '', font, NOTES_W - 24).lines });
      });
      if (base) {
        base.notesW = NOTES_W;
        base.notesH =
          18 +
          2 * u +
          base.notesList.reduce((h, n) => h + n.lines.length * 18, 0) +
          (base.notesList.length - 1) * 2 * u;
      }
    }
  }

  const outer = (f: PlacedFrame) => f.w + (f.notesW > 0 ? NOTES_GAP + f.notesW : 0);
  const tall = (f: PlacedFrame) => Math.max(f.h, f.notesH);

  // Place the frames. Lanes above the frames are counted on a first pass, then frames move down.
  const place = (top: number, left: number) => {
    let x = left;
    for (const g of groups) {
      let y = top;
      let gw = 0;
      for (const row of g) {
        let fx = x;
        let rh = 0;
        for (const f of row) {
          f.x = r(fx);
          f.y = r(y);
          fx += outer(f) + H_GAP;
          rh = Math.max(rh, tall(f));
        }
        gw = Math.max(gw, fx - H_GAP - x);
        y += rh + V_GAP;
      }
      x += gw + H_GAP;
    }
  };

  const frames = groups.flat(2);
  if (alone) {
    place(0, 0);
    const f = frames[0] as PlacedFrame;
    return {
      frames,
      arrows: [],
      width: r(outer(f)),
      height: r(tall(f)),
      alone,
      layout,
      linkCount: countLinks(doc),
    };
  }

  place(MARGIN + TITLE, MARGIN);
  let arrows = showFlows
    ? route(doc, all, layout, groups, baseFrame, extraFrame, outer, 0)
    : { arrows: [], lanes: 0 };
  if (arrows.lanes > 0) {
    place(MARGIN + LANE * arrows.lanes + TITLE, MARGIN);
    arrows = route(doc, all, layout, groups, baseFrame, extraFrame, outer, arrows.lanes);
  }
  let width = 0;
  let height = 0;
  for (const f of frames) {
    width = Math.max(width, f.x + outer(f));
    height = Math.max(height, f.y + tall(f));
  }
  return {
    frames,
    arrows: arrows.arrows,
    width: r(width + MARGIN),
    height: r(height + MARGIN),
    alone,
    layout,
    linkCount: countLinks(doc),
  };
}

function collect(l: Laid): Laid[] {
  const out: Laid[] = [l];
  for (const c of l.children) out.push(...collect(c));
  return out;
}

export function countLinks(doc: Document): number {
  let n = doc.flows?.length ?? 0;
  for (const w of walk(doc)) if (w.node.link) n++;
  return n;
}

interface Gap {
  a: number;
  b: number;
}

function route(
  doc: Document,
  all: ReturnType<typeof walk>,
  layout: Layout,
  groups: PlacedFrame[][][],
  baseFrame: Map<Node, PlacedFrame>,
  extraFrame: Map<Node, PlacedFrame>,
  outer: (f: PlacedFrame) => number,
  laneCount: number,
): { arrows: Arrow[]; lanes: number } {
  // The gaps on each side of each frame.
  const leftGap = new Map<PlacedFrame, Gap>();
  const rightGap = new Map<PlacedFrame, Gap>();
  let prevGroupRight = 0;
  groups.forEach((g, gi) => {
    let groupRight = 0;
    for (const row of g) for (const f of row) groupRight = Math.max(groupRight, f.x + outer(f));
    const nextGroupLeft = groups[gi + 1]?.[0]?.[0]?.x ?? groupRight + H_GAP;
    for (const row of g) {
      row.forEach((f, i) => {
        const prev = row[i - 1];
        const next = row[i + 1];
        leftGap.set(f, { a: prev ? prev.x + outer(prev) : prevGroupRight, b: f.x });
        rightGap.set(f, { a: f.x + outer(f), b: next ? next.x : nextGroupLeft });
      });
    }
    prevGroupRight = groupRight;
  });

  // Every link, in order: element links in a depth-first walk of each screen, then flows.
  interface Plan {
    from: PlacedFrame;
    to: PlacedFrame;
    start?: Box;
    label?: string;
  }
  const plans: Plan[] = [];
  for (const w of all) {
    const n = w.node;
    if (!n.link) continue;
    const overlay = ancestorOverlay(n, w.screen);
    const from = overlay
      ? overlay.flags?.includes('open')
        ? baseFrame.get(w.screen)
        : extraFrame.get(overlay)
      : baseFrame.get(w.screen);
    const target = all.find((t) => t.node.id === n.link?.to)?.node;
    if (!from || !target) continue;
    let to: PlacedFrame | undefined;
    if (OVERLAYS.has(target.type)) {
      if (target.flags?.includes('open')) continue; // a link to an open overlay is not drawn
      to = extraFrame.get(target);
    } else {
      to = baseFrame.get(target);
    }
    if (!to || to === from) continue;
    const el = (from.overlay && overlay ? collect(from.overlay) : frameElements(from)).find(
      (l) => l.node === n,
    );
    if (!el) continue;
    const plan: Plan = { from, to, start: el.box };
    if (n.link.label !== undefined) plan.label = n.link.label;
    plans.push(plan);
  }
  for (const f of doc.flows ?? []) {
    const fs = doc.screens.find((s) => s.id === f.from);
    const ts = doc.screens.find((s) => s.id === f.to);
    const from = fs ? baseFrame.get(fs) : undefined;
    const to = ts ? baseFrame.get(ts) : undefined;
    if (!from || !to || from === to) continue;
    const plan: Plan = { from, to };
    if (f.label !== undefined) plan.label = f.label;
    plans.push(plan);
  }

  // First pass: which gaps each arrow uses.
  const key = (g: Gap) => `${g.a}:${g.b}`;
  const usage = new Map<string, number>();
  const routes = plans.map((p) => {
    const S = p.from;
    const T = p.to;
    let dir: 'right' | 'left';
    let overlap = false;
    if (T.x >= S.x + outer(S)) dir = 'right';
    else if (T.x + outer(T) <= S.x) dir = 'left';
    else {
      dir = 'left';
      overlap = true;
    }
    const gs = (dir === 'right' ? rightGap.get(S) : leftGap.get(S)) as Gap;
    const gt = (dir === 'right' || overlap ? leftGap.get(T) : rightGap.get(T)) as Gap;
    const same = key(gs) === key(gt);
    const slotS = (usage.get(key(gs)) ?? 0) + 1;
    usage.set(key(gs), slotS);
    let slotT = slotS;
    if (!same) {
      slotT = (usage.get(key(gt)) ?? 0) + 1;
      usage.set(key(gt), slotT);
    }
    return { p, dir, overlap, gs, gt, same, slotS, slotT };
  });

  let lanes = 0;
  const top = Math.min(...groups.flat(2).map((f) => f.y)) - TITLE;
  const arrows: Arrow[] = routes.map((rt) => {
    const { p, dir, overlap, gs, gt, same } = rt;
    const S = p.from;
    const T = p.to;
    const xIn = (g: Gap, k: number) => r(g.a + ((g.b - g.a) * k) / ((usage.get(key(g)) ?? 1) + 1));
    let start: [number, number];
    if (p.start) {
      const b = p.start;
      start = [r(S.x + (dir === 'right' ? b.x + b.w : b.x)), r(S.y + b.y + b.h / 2)];
    } else {
      start = [r(dir === 'right' ? S.x + S.w : S.x), r(S.y + S.h / 2)];
    }
    const entryY = r(T.y + 48);
    const entryX = r(dir === 'right' || overlap ? T.x : T.x + T.w);
    const xs = xIn(gs, rt.slotS);
    let points: [number, number][];
    if (same) {
      points = [start, [xs, start[1]], [xs, entryY], [entryX, entryY]];
    } else {
      lanes++;
      const laneY = laneCount > 0 ? r(top - LANE * lanes) : r(top - LANE * lanes);
      const xt = xIn(gt, rt.slotT);
      points = [start, [xs, start[1]], [xs, laneY], [xt, laneY], [xt, entryY], [entryX, entryY]];
    }
    points = points.filter(
      (pt, i) => i === 0 || pt[0] !== points[i - 1]?.[0] || pt[1] !== points[i - 1]?.[1],
    );
    const arrow: Arrow = { points, mid: midpoint(points) };
    if (p.label !== undefined) arrow.label = p.label;
    return arrow;
  });
  void layout;
  return { arrows, lanes };
}

function ancestorOverlay(n: Node, screen: Node): Node | undefined {
  for (const o of screen.children ?? []) {
    if (!OVERLAYS.has(o.type)) continue;
    if (contains(o, n)) return o;
  }
  return undefined;
}

function contains(a: Node, b: Node): boolean {
  if (a === b) return true;
  return (a.children ?? []).some((c) => contains(c, b));
}

/** The point halfway along a path of straight segments. */
export function midpoint(points: [number, number][]): [number, number] {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += seg(points[i - 1], points[i]);
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as [number, number];
    const b = points[i] as [number, number];
    const d = seg(a, b);
    if (left <= d && d > 0) {
      const t = left / d;
      return [r(a[0] + (b[0] - a[0]) * t), r(a[1] + (b[1] - a[1]) * t)];
    }
    left -= d;
  }
  return points[0] ?? [0, 0];
}

function seg(a: [number, number] | undefined, b: [number, number] | undefined): number {
  if (!a || !b) return 0;
  return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
}
