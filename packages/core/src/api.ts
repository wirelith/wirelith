// SPDX-License-Identifier: MIT

// The public functions. All are pure and synchronous: no I/O, no DOM, no network.

import { OVERLAYS } from './components.js';
import { Layout } from './layout.js';
import { buildOverview, countLinks, frameElements, type Overview } from './overview.js';
import { diagnostic, normalizeSource, parse as parseSource, SPEC_VERSION } from './parse.js';
import { paint } from './render.js';
import { resolveTheme, type Theme } from './theme.js';
import type { Diagnostic, Document, Node, Options, Outline, OutlineLink, OutlineScreen } from './types.js';
import { CAPS, check, hasErrors, sortDiagnostics, textOf, walk } from './validate.js';

const PREFIX = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** The fixed source of the theme specimen (spec section 9.6). */
export const SPECIMEN_SOURCE = `screen "Specimen"
  h1 "Heading one"
  h2 "Heading two"
  h3 "Heading three"
  text "Body text. The quick brown fox jumps over the lazy dog."
  label "Label text"
  row
    button "Primary" primary
    button "Secondary"
    button "Danger" danger
  input "Input" placeholder="Placeholder"
  row
    checkbox "Checkbox" checked
    toggle "Toggle" on
  row
    badge "Default"
    badge "Primary" primary
    badge "Success" success
    badge "Danger" danger
  card "Card"
    text "Card content"
`;

interface Analysis {
  tree: Document;
  diagnostics: Diagnostic[];
  theme?: Theme;
  overview?: Overview;
  /** The document actually drawn: the source's, or the specimen's. */
  drawn?: Document;
}

function checkOptions(options: Options): void {
  if (options.idPrefix !== undefined && !PREFIX.test(options.idPrefix)) {
    throw new TypeError(`idPrefix "${options.idPrefix}" must match [A-Za-z][A-Za-z0-9_-]*`);
  }
}

/** Parse, check, resolve the theme, and (when there are no errors and `lay` is set) lay out. */
function analyse(source: string, options: Options, lay: boolean): Analysis {
  checkOptions(options);
  const p = parseSource(source);
  if (p.tooLarge || p.diagnostics.some((d) => d.code === 'E103')) {
    return { tree: p.tree, diagnostics: sortDiagnostics(p.diagnostics) };
  }
  const semantic = check(p.tree);
  if (semantic.length === 1 && semantic[0]?.code === 'E701') {
    return { tree: p.tree, diagnostics: semantic };
  }
  const themeDiagnostics: Diagnostic[] = [];
  const theme = resolveTheme(p.tree, options, p.tokenLines, themeDiagnostics);
  let diagnostics = sortDiagnostics([...p.diagnostics, ...semantic, ...themeDiagnostics]);
  const result: Analysis = { tree: p.tree, diagnostics, theme };
  if (!lay || hasErrors(diagnostics)) return result;

  const drawn = p.tree.screens.length > 0 ? p.tree : specimen(theme);
  const overview = buildOverview(drawn, theme, options);
  const extra = [...overview.layout.warnings];
  if (overview.width > CAPS.canvas || overview.height > CAPS.canvas) {
    return {
      tree: p.tree,
      diagnostics: [
        diagnostic(
          'E701',
          { line: 1, column: 1 },
          `The output would be ${overview.width} by ${overview.height} px; the limit is ${CAPS.canvas.toLocaleString('en-US')} px on either side`,
        ),
      ],
    };
  }
  // Layout warnings for the specimen belong to the specimen, not the source.
  if (drawn === p.tree) diagnostics = sortDiagnostics([...diagnostics, ...extra]);
  return { ...result, diagnostics, overview, drawn };
}

function specimen(theme: Theme): Document {
  const doc = parseSource(SPECIMEN_SOURCE).tree;
  const screen = doc.screens[0] as Node;
  screen.label = `Theme: ${theme.name}`;
  const swatches: Node = { type: 'swatches', loc: { line: 1, column: 1 } };
  screen.children = [swatches, ...(screen.children ?? [])];
  return doc;
}

/** Parses a source into its syntax tree (spec section 13), with the syntax diagnostics. */
export function parse(source: string): { tree: Document; diagnostics: Diagnostic[] } {
  const p = parseSource(source);
  return { tree: p.tree, diagnostics: sortDiagnostics(p.diagnostics) };
}

/** Every diagnostic for a source (spec section 15), sorted. */
export function validate(source: string, options: Options = {}): Diagnostic[] {
  return analyse(source, options, true).diagnostics;
}

/** The result of `render`: the SVG, or null when the source has errors. */
export interface RenderResult {
  svg: string | null;
  diagnostics: Diagnostic[];
}

/** Renders a source to an SVG document (spec section 12). */
export function render(source: string, options: Options = {}): RenderResult {
  const a = analyse(source, options, true);
  if (!a.overview || !a.theme || !a.drawn || hasErrors(a.diagnostics))
    return { svg: null, diagnostics: a.diagnostics };
  const ov = a.overview;
  const shown = [...new Set(ov.frames.map((f) => f.screen))];
  const isSpecimen = a.drawn !== a.tree;
  const title = isSpecimen
    ? `Theme: ${a.theme.name}`
    : shown.length === 1
      ? (shown[0]?.label ?? '')
      : `${a.drawn.screens.length} screens`;
  const links = isSpecimen ? 0 : countLinks(a.tree);
  const desc = `Screens: ${shown.map((s) => s.label ?? '').join(', ')}. ${links} ${links === 1 ? 'link' : 'links'}.`;
  const input: Parameters<typeof paint>[0] = {
    overview: ov,
    theme: a.theme,
    idPrefix: options.idPrefix ?? 'wl',
    title,
    desc,
  };
  if (options.embedSource !== false) input.source = normalizeSource(source).replace(/\r\n?/g, '\n');
  return { svg: paint(input), diagnostics: a.diagnostics };
}

/** A laid-out element, for tools. */
export interface LaidOutElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  width: number;
  height: number;
  frames: {
    id: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    elements: LaidOutElement[];
  }[];
  diagnostics: Diagnostic[];
}

/** Lays out a source (spec section 10). Element positions are relative to their frame. */
export function layout(source: string, options: Options = {}): LayoutResult {
  const a = analyse(source, options, true);
  if (!a.overview) return { width: 0, height: 0, frames: [], diagnostics: a.diagnostics };
  const L = a.overview.layout;
  const key = (n: Node) => n.id ?? `n${L.index.get(n) ?? 0}`;
  return {
    width: a.overview.width,
    height: a.overview.height,
    frames: a.overview.frames.map((f) => ({
      id: f.key,
      title: f.title,
      x: f.x,
      y: f.y,
      width: f.w,
      height: f.h,
      elements: frameElements(f).map((l) => ({
        id: key(l.node),
        type: l.node.type,
        x: l.box.x,
        y: l.box.y,
        width: l.box.w,
        height: l.box.h,
      })),
    })),
    diagnostics: a.diagnostics,
  };
}

/** The outline of a source (spec section 13.2), or null when it has errors. */
export function outline(
  source: string,
  options: Options = {},
): { outline: Outline | null; diagnostics: Diagnostic[] } {
  const a = analyse(source, options, false);
  if (hasErrors(a.diagnostics) || !a.theme) return { outline: null, diagnostics: a.diagnostics };
  const doc = a.tree;
  const L = new Layout(doc, a.theme);
  const key = (n: Node) => n.id ?? `n${L.index.get(n) ?? 0}`;
  const screens: OutlineScreen[] = doc.screens.map((s) => {
    const d = L.device(s);
    const out: OutlineScreen = {
      id: key(s),
      title: s.label ?? '',
      device: { name: d.name, width: d.w, height: d.h },
      overlays: [],
    };
    const of = s.attrs?.of;
    if (typeof of === 'object' && of !== null && !Array.isArray(of)) {
      out.of = of.ref;
      const state = textOf(s.attrs?.state);
      if (state !== undefined) out.state = state;
    }
    out.overlays = (s.children ?? [])
      .filter((c) => OVERLAYS.has(c.type))
      .map((o) => {
        const entry: OutlineScreen['overlays'][number] = {
          id: key(o),
          type: o.type as 'modal' | 'drawer',
          open: o.flags?.includes('open') ?? false,
        };
        if (o.label !== undefined) {
          return { id: entry.id, type: entry.type, title: o.label, open: entry.open };
        }
        return entry;
      });
    return out;
  });
  const links: OutlineLink[] = [];
  for (const w of walk(doc)) {
    const n = w.node;
    if (!n.link) continue;
    const element: NonNullable<OutlineLink['from']['element']> = {
      index: w.index,
      type: n.type,
      line: n.loc.line,
    };
    const el = n.id !== undefined ? { id: n.id, ...element } : element;
    const link: OutlineLink = {
      kind: 'element',
      from: { screen: key(w.screen), element: el },
      to: n.link.to,
    };
    if (n.link.label !== undefined) link.label = n.link.label;
    links.push(link);
  }
  for (const f of doc.flows ?? []) {
    const link: OutlineLink = { kind: 'flow', from: { screen: f.from }, to: f.to };
    if (f.label !== undefined) link.label = f.label;
    links.push(link);
  }
  return { outline: { screens, links }, diagnostics: a.diagnostics };
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * Reads the source embedded in an SVG (spec section 12.3), or returns null when there is none.
 * The SVG is untrusted: this only searches the text, and the result is untrusted too.
 */
export function extractSource(svg: string): string | null {
  if (typeof svg !== 'string') return null;
  const m = /<wl:source(?:\s[^<>]*)?(?:\/>|>([\s\S]*?)<\/wl:source\s*>)/.exec(svg);
  if (!m) return null;
  const raw = m[1] ?? '';
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ent: string) => {
    if (ent.startsWith('#x')) return safeChar(Number.parseInt(ent.slice(2), 16)) ?? whole;
    if (ent.startsWith('#')) return safeChar(Number.parseInt(ent.slice(1), 10)) ?? whole;
    return ENTITY[ent] ?? whole;
  });
}

function safeChar(cp: number): string | undefined {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return undefined;
  return String.fromCodePoint(cp);
}

export { SPEC_VERSION };
