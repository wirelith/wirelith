// SPDX-License-Identifier: MIT

// The overview (spec sections 6, 7.4 and 10.6): frames placed in groups, notes below them, and
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
/** The narrowest a notes list may be. It is otherwise as wide as its frame. */
const NOTES_W = 240;
const LANE = 12;
/** The widest the overview may be (spec section 16); groups wrap into a new band beyond it. */
const CANVAS = 16000;

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

  // Notes: a list below each base frame, and markers wherever their target is drawn. The list
  // is below, not beside, so arrows, which only cross the gaps beside and above frames, never
  // cross it.
  if (showNotes) {
    for (const s of doc.screens) {
      const notes = (s.children ?? []).filter((c) => c.type === 'note');
      if (notes.length === 0) continue;
      const base = baseFrame.get(s);
      const font = layout.body(13, 400);
      const listW = Math.max(base?.w ?? 0, NOTES_W);
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
        if (base) base.notesList.push({ number, lines: wrap(note.label ?? '', font, listW - 24).lines });
      });
      if (base) {
        base.notesW = listW;
        base.notesH =
          18 +
          2 * u +
          base.notesList.reduce((h, n) => h + n.lines.length * 18, 0) +
          (base.notesList.length - 1) * 2 * u;
      }
    }
  }

  const outer = (f: PlacedFrame) => Math.max(f.w, f.notesW);
  const tall = (f: PlacedFrame) => (f.notesH > 0 ? f.h + NOTES_GAP + f.notesH : f.h);

  // Groups go left to right in bands. A group that would make the canvas wider than allowed
  // starts a new band below (spec section 7.4).
  // A group's frames are aligned in columns: the j-th frame of every row starts at column j, and
  // each column is as wide as its widest frame. The gaps between columns are then clear from the
  // top of the band to the bottom, so an arrow running down one never crosses a frame.
  const columnXs = (g: PlacedFrame[][]): number[] => {
    const widths: number[] = [];
    for (const row of g) {
      for (const [j, f] of row.entries()) widths[j] = Math.max(widths[j] ?? 0, outer(f));
    }
    const xs: number[] = [];
    let x = 0;
    for (const w of widths) {
      xs.push(x);
      x += w + H_GAP;
    }
    xs.push(x - H_GAP); // the right edge of the last column
    return xs;
  };
  const groupWidth = (g: PlacedFrame[][]) => columnXs(g).at(-1) ?? 0;
  const groupHeight = (g: PlacedFrame[][]) =>
    g.reduce((h, row) => h + Math.max(...row.map(tall)), 0) + V_GAP * (g.length - 1);
  const bands: PlacedFrame[][][][] = [];
  {
    let x = MARGIN;
    for (const g of groups) {
      const w = groupWidth(g);
      const band = bands[bands.length - 1];
      if (!band || (band.length > 0 && x + w + MARGIN > CANVAS)) {
        bands.push([g]);
        x = MARGIN + w + H_GAP;
      } else {
        band.push(g);
        x += w + H_GAP;
      }
    }
  }
  const bandOf = new Map<PlacedFrame, number>();
  bands.forEach((band, b) => {
    for (const g of band) for (const row of g) for (const f of row) bandOf.set(f, b);
  });

  /** Places every frame. `lanes[b]` is how many arrow lanes run above band b. Returns band tops. */
  const place = (lanes: number[]): number[] => {
    const tops: number[] = [];
    let top = MARGIN + LANE * (lanes[0] ?? 0) + TITLE;
    bands.forEach((band, b) => {
      if (b > 0) top += H_GAP + LANE * (lanes[b] ?? 0);
      tops.push(top);
      let x = MARGIN;
      let bandH = 0;
      for (const g of band) {
        let y = top;
        const cols = columnXs(g);
        for (const row of g) {
          let rh = 0;
          for (const [j, f] of row.entries()) {
            f.x = r(x + (cols[j] ?? 0));
            f.y = r(y);
            rh = Math.max(rh, tall(f));
          }
          y += rh + V_GAP;
        }
        x += groupWidth(g) + H_GAP;
        bandH = Math.max(bandH, groupHeight(g));
      }
      top += bandH;
    });
    return tops;
  };

  const frames = groups.flat(2);
  if (alone) {
    const f = frames[0] as PlacedFrame;
    f.x = 0;
    f.y = 0;
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

  // Lanes are counted on a first pass, then the bands move apart to make room for them.
  let tops = place([]);
  let arrows = showFlows
    ? route(doc, all, bands, bandOf, tops, baseFrame, extraFrame, outer, columnXs)
    : { arrows: [], lanes: [] as number[] };
  if (arrows.lanes.some((n) => n > 0)) {
    tops = place(arrows.lanes);
    arrows = route(doc, all, bands, bandOf, tops, baseFrame, extraFrame, outer, columnXs);
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

/** A gap between frames: an x-range within one band. */
interface Gap {
  band: number;
  a: number;
  b: number;
}

function route(
  doc: Document,
  all: ReturnType<typeof walk>,
  bands: PlacedFrame[][][][],
  bandOf: Map<PlacedFrame, number>,
  tops: number[],
  baseFrame: Map<Node, PlacedFrame>,
  extraFrame: Map<Node, PlacedFrame>,
  outer: (f: PlacedFrame) => number,
  columnXs: (g: PlacedFrame[][]) => number[],
): { arrows: Arrow[]; lanes: number[] } {
  // The gaps on each side of each frame, within its band.
  const leftGap = new Map<PlacedFrame, Gap>();
  const rightGap = new Map<PlacedFrame, Gap>();
  // A gap is between two columns of a group, or between two groups, so it is clear for the whole
  // height of the band.
  bands.forEach((groups, band) => {
    let prevGroupRight = 0;
    groups.forEach((g, gi) => {
      const left = g[0]?.[0]?.x ?? 0;
      const cols = columnXs(g);
      const n = cols.length - 1;
      const colLeft = (j: number) => left + (cols[j] ?? 0);
      const colRight = (j: number) => (j + 1 < n ? colLeft(j + 1) - H_GAP : left + (cols[n] ?? 0));
      const groupRight = colRight(n - 1);
      const nextGroupLeft = groups[gi + 1]?.[0]?.[0]?.x ?? groupRight + H_GAP;
      for (const row of g) {
        row.forEach((f, j) => {
          leftGap.set(f, { band, a: j > 0 ? colRight(j - 1) : prevGroupRight, b: colLeft(j) });
          rightGap.set(f, { band, a: colRight(j), b: j + 1 < n ? colLeft(j + 1) : nextGroupLeft });
        });
      }
      prevGroupRight = groupRight;
    });
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
  // Gaps in different bands are different gaps, even where their x-ranges line up.
  const key = (g: Gap) => `${g.band}:${g.a}:${g.b}`;
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

  // Lanes run above the band that holds the arrow's target, numbered per band in link order.
  const lanes: number[] = bands.map(() => 0);
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
      const b = bandOf.get(T) ?? 0;
      lanes[b] = (lanes[b] ?? 0) + 1;
      const laneY = r((tops[b] ?? 0) - TITLE - LANE * (lanes[b] ?? 0));
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
