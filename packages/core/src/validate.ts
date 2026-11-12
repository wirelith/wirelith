// SPDX-License-Identifier: MIT

// Validation (spec sections 5 to 7, 15 and 16): everything that can be checked from the syntax
// tree, after parsing. Diagnostics about meaning point at the start of the element's line.

import {
  ALIGNS,
  COMMON_ATTRS,
  COMMON_FLAGS,
  COMPONENTS,
  closest,
  INPUT_TYPES,
  JUSTIFIES,
  OVERLAYS,
  own,
  SIZES,
} from './components.js';
import { ICON_NAMES } from './data/icons.js';
import { diagnostic } from './parse.js';
import type { Diagnostic, Document, Loc, Node, Value } from './types.js';

export const CAPS = {
  elements: 2000,
  screens: 50,
  depth: 16,
  string: 500,
  listItems: 100,
  tableColumns: 20,
  tableRows: 200,
  links: 500,
  canvas: 16000,
};

const PERCENT = /^([0-9]+(\.[0-9]+)?)%$/;

/** Counts Unicode code points. */
export function length(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

export interface Walked {
  node: Node;
  parent: Node | undefined;
  screen: Node;
  depth: number;
  index: number;
}

/** A depth-first, pre-order walk over the screens and everything under them (section 12.2). */
export function walk(doc: Document): Walked[] {
  const out: Walked[] = [];
  const visit = (node: Node, parent: Node | undefined, screen: Node, depth: number) => {
    out.push({ node, parent, screen, depth, index: out.length });
    for (const c of node.children ?? []) visit(c, node, screen, depth + 1);
  };
  for (const s of doc.screens) visit(s, undefined, s, 1);
  return out;
}

/** Checks the size caps (section 16) that can be checked before layout. */
export function checkCaps(doc: Document, all: Walked[]): Diagnostic | undefined {
  const at = (loc: Loc, message: string) => diagnostic('E701', loc, message);
  const first = { line: 1, column: 1 };
  if (all.length > CAPS.elements) {
    return at(
      first,
      `This source has ${all.length.toLocaleString('en-US')} elements; the limit is ${CAPS.elements.toLocaleString('en-US')}`,
    );
  }
  if (doc.screens.length > CAPS.screens) {
    return at(first, `This source has ${doc.screens.length} screens; the limit is ${CAPS.screens}`);
  }
  let links = doc.flows?.length ?? 0;
  for (const w of all) {
    const n = w.node;
    if (w.depth > CAPS.depth)
      return at(n.loc, `Line ${n.loc.line}: elements are nested more than ${CAPS.depth} deep`);
    if (n.link) links++;
    const strings: string[] = [];
    if (n.label !== undefined) strings.push(n.label);
    if (n.link?.label !== undefined) strings.push(n.link.label);
    for (const i of n.items ?? []) strings.push(i);
    for (const v of Object.values(n.attrs ?? {})) {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) strings.push(...v);
    }
    for (const s of strings) {
      if (length(s) > CAPS.string) {
        return at(
          n.loc,
          `Line ${n.loc.line}: a string is ${length(s)} characters long; the limit is ${CAPS.string}`,
        );
      }
    }
    const lists = [n.items, ...Object.values(n.attrs ?? {}).filter(Array.isArray)];
    for (const l of lists) {
      if (l && l.length > CAPS.listItems) {
        return at(n.loc, `Line ${n.loc.line}: a list has ${l.length} items; the limit is ${CAPS.listItems}`);
      }
    }
    if (n.type === 'table') {
      const cols = n.items?.length ?? 0;
      const rowsAttr = n.attrs?.rows;
      const rows =
        (n.children?.length ?? 0) + (typeof rowsAttr === 'number' ? Math.max(0, Math.trunc(rowsAttr)) : 0);
      if (cols > CAPS.tableColumns) {
        return at(
          n.loc,
          `Line ${n.loc.line}: this table has ${cols} columns; the limit is ${CAPS.tableColumns}`,
        );
      }
      if (rows > CAPS.tableRows) {
        return at(n.loc, `Line ${n.loc.line}: this table has ${rows} rows; the limit is ${CAPS.tableRows}`);
      }
    }
  }
  for (const f of doc.flows ?? []) {
    for (const s of [f.label ?? '']) {
      if (length(s) > CAPS.string)
        return at(
          f.loc,
          `Line ${f.loc.line}: a string is ${length(s)} characters long; the limit is ${CAPS.string}`,
        );
    }
  }
  const theme = doc.theme;
  if (theme) {
    for (const s of [theme.name, theme.extends ?? '', ...Object.values(theme.tokens ?? {}).map(String)]) {
      if (length(s) > CAPS.string) {
        return at(
          theme.loc ?? first,
          `Line ${theme.loc?.line ?? 1}: a string is ${length(s)} characters long; the limit is ${CAPS.string}`,
        );
      }
    }
  }
  if (links > CAPS.links)
    return at(first, `This source has ${links} links and flows; the limit is ${CAPS.links}`);
  return undefined;
}

const has = (n: Node, flag: string) => n.flags?.includes(flag) ?? false;
const isRef = (v: Value | undefined): v is { ref: string } =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether a width or height value is allowed (section 5.10). */
export function sizeValue(v: Value | undefined): boolean {
  if (typeof v === 'number') return v >= 0 && v <= 16000;
  if (typeof v !== 'string') return false;
  if (v === 'fill') return true;
  const m = PERCENT.exec(v);
  return m !== null && Number(m[1]) <= 100;
}

const wholeIn = (v: Value | undefined, lo: number, hi: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Checks one value against section 5.10's table. Returns the problem, or undefined. */
function valueProblem(node: Node, key: string, v: Value): string | undefined {
  const t = node.type;
  switch (key) {
    case 'gap':
    case 'pad':
      return typeof v === 'string' && SIZES.includes(v)
        ? undefined
        : `${key}="${show(v)}" is not a size; using the default`;
    case 'align':
      return typeof v === 'string' && ALIGNS.includes(v)
        ? undefined
        : `align="${show(v)}" is not start, center, end or stretch`;
    case 'justify':
      return typeof v === 'string' && JUSTIFIES.includes(v)
        ? undefined
        : `justify="${show(v)}" is not start, center, end or between`;
    case 'width':
    case 'height':
      return sizeValue(v) ? undefined : `${key}="${show(v)}" is not a number of pixels, a percentage or fill`;
    case 'type':
      return t === 'input' && typeof v === 'string' && INPUT_TYPES.includes(v)
        ? undefined
        : `type="${show(v)}" is not a field type; using text`;
    case 'cols':
      return wholeIn(v, 1, 12) ? undefined : 'cols must be a whole number from 1 to 12; using 2';
    case 'span':
      return wholeIn(v, 1, 12) ? undefined : 'span must be a whole number from 1 to 12; using 1';
    case 'rows':
    case 'lines':
      return wholeIn(v, 1, 100) ? undefined : `${key} must be a whole number from 1 to 100`;
    case 'size':
      if (t === 'screen') {
        const m = typeof v === 'string' ? /^([0-9]+)x([0-9]+)$/.exec(v) : null;
        return m && Number(m[1]) >= 1 && Number(m[1]) <= 16000 && Number(m[2]) >= 1 && Number(m[2]) <= 16000
          ? undefined
          : `size="${show(v)}" is not WxH with each side from 1 to 16000; using the device size`;
      }
      if (typeof v === 'number') return v >= 0 && v <= 16000 ? undefined : 'size must be from 0 to 16000';
      return typeof v === 'string' && SIZES.includes(v) ? undefined : `size="${show(v)}" is not a size`;
    case 'ratio': {
      const m = typeof v === 'string' ? /^([0-9]+(\.[0-9]+)?):([0-9]+(\.[0-9]+)?)$/.exec(v) : null;
      return m && Number(m[1]) > 0 && Number(m[3]) > 0
        ? undefined
        : `ratio="${show(v)}" is not W:H; using 4:3`;
    }
    case 'of':
    case 'for':
      return isRef(v) ? undefined : `${key}= takes an id, such as ${key}=#home`;
    case 'state':
    case 'placeholder':
    case 'value':
    case 'error':
    case 'active':
    case 'badge':
    case 'icon':
      return typeof v === 'string' || typeof v === 'number' ? undefined : `${key} takes text`;
    default:
      return undefined;
  }
}

function show(v: Value): string {
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  if (isRef(v)) return `#${v.ref}`;
  return String(v);
}

/** Text of a value that may be written bare or quoted, such as value=1. */
export function textOf(v: Value | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

/** All semantic checks. Returns diagnostics; never throws. */
export function check(doc: Document): Diagnostic[] {
  const out: Diagnostic[] = [];
  const all = walk(doc);
  const caps = checkCaps(doc, all);
  if (caps) return [caps];

  const add = (code: string, loc: Loc, message: string, hint?: string) =>
    out.push(diagnostic(code, loc, message, hint));
  const byId = new Map<string, Walked>();
  const skipped = new Set<Node>();

  // Ids (E301).
  for (const w of all) {
    const id = w.node.id;
    if (id === undefined) continue;
    const prev = byId.get(id);
    if (prev) {
      add(
        'E301',
        w.node.loc,
        `Line ${w.node.loc.line}: #${id} is already used on line ${prev.node.loc.line}`,
      );
    } else {
      byId.set(id, w);
    }
  }

  // Placement and children (E203, E204), per screen.
  for (const screen of doc.screens) {
    const seen = new Map<string, Node>();
    for (const c of screen.children ?? []) {
      const key = c.type === 'sidebar' ? (has(c, 'right') ? 'sidebar right' : 'sidebar left') : c.type;
      if (['header', 'footer', 'sidebar left', 'sidebar right'].includes(key)) {
        const prev = seen.get(key);
        if (prev)
          add(
            'E203',
            c.loc,
            `Line ${c.loc.line}: a screen has only one ${key}; the first is on line ${prev.loc.line}`,
          );
        else seen.set(key, c);
      }
    }
  }
  for (const w of all) {
    const n = w.node;
    const p = w.parent;
    if (p && skipped.has(p)) {
      skipped.add(n);
      continue;
    }
    if (p) {
      const ps = own(COMPONENTS, p.type);
      if (ps && !ps.children) {
        if (p.children?.[0] === n) {
          add('E204', n.loc, `Line ${n.loc.line}: "${p.type}" cannot contain other elements`);
        }
        skipped.add(n);
        continue;
      }
      const where = placementProblem(n, p);
      if (where) add('E203', n.loc, `Line ${n.loc.line}: ${where}`);
    }
  }

  // Flags, attributes, label, items and values (W202, W205), icons (W301), lists (W302).
  for (const w of all) {
    const n = w.node;
    if (skipped.has(n)) continue;
    const spec = own(COMPONENTS, n.type);
    if (!spec) continue;
    // One diagnostic per code per element, listing every problem, because they share a position.
    const name = n.type === 'table-row' ? 'row' : n.type;
    const ownParts = [...spec.flags, ...spec.attrs];
    const unknownParts: string[] = [];
    const badValues: string[] = [];
    for (const f of n.flags ?? []) {
      if (!spec.flags.includes(f) && !COMMON_FLAGS.includes(f)) {
        unknownParts.push(
          spec.attrs.includes(f) || COMMON_ATTRS.includes(f) ? `"${f}" without a value` : `"${f}"`,
        );
      }
    }
    for (const [k, v] of Object.entries(n.attrs ?? {})) {
      if (spec.flags.includes(k) || COMMON_FLAGS.includes(k)) {
        unknownParts.push(`"${k}=" (${k} is a flag; write it on its own)`);
        continue;
      }
      if (!spec.attrs.includes(k) && !COMMON_ATTRS.includes(k)) {
        unknownParts.push(`"${k}"`);
        continue;
      }
      const problem = valueProblem(n, k, v);
      if (problem) badValues.push(problem);
    }
    if (n.label !== undefined && !spec.label) unknownParts.push('a label');
    if (n.items !== undefined && !spec.items) unknownParts.push('a list');
    if (unknownParts.length > 0) {
      add(
        'W202',
        n.loc,
        `Line ${n.loc.line}: "${name}" has no ${unknownParts.join(', ')} (it has: ${ownParts.join(', ') || 'no flags or attributes of its own'})`,
      );
    }
    if (badValues.length > 0) add('W205', n.loc, `Line ${n.loc.line}: ${badValues.join('; ')}`);

    // Icons.
    const iconName =
      n.type === 'icon'
        ? n.label
        : n.type === 'button' || n.type === 'item'
          ? textOf(n.attrs?.icon)
          : undefined;
    if (iconName !== undefined && !Object.hasOwn(ICON_NAMES, iconName)) {
      const guess = closest(iconName, Object.keys(ICON_NAMES));
      add(
        'W301',
        n.loc,
        `Line ${n.loc.line}: there is no icon "${iconName}".${guess ? ` Did you mean "${guess}"?` : ''}`,
      );
    }

    // active= and value= must name an entry.
    const entries =
      n.items ??
      (n.type === 'nav' ? n.children?.filter((c) => c.type === 'item').map((c) => c.label ?? '') : undefined);
    const named =
      n.type === 'nav' || n.type === 'tabs'
        ? textOf(n.attrs?.active)
        : n.type === 'select' || n.type === 'radio'
          ? textOf(n.attrs?.value)
          : undefined;
    if (named !== undefined && entries && !entries.includes(named)) {
      const what = n.type === 'tabs' ? 'tabs' : n.type === 'nav' ? 'entries' : 'options';
      add('W302', n.loc, `Line ${n.loc.line}: "${named}" is not one of the ${what}`);
    }

    // Table rows with more cells than columns.
    if (n.type === 'table-row' && w.parent?.type === 'table') {
      const cols = w.parent.items?.length ?? 0;
      if ((n.items?.length ?? 0) > cols) {
        add(
          'W601',
          n.loc,
          `Line ${n.loc.line}: this row has ${n.items?.length} cells but the table has ${cols} columns`,
        );
      }
    }
  }

  // References (E401, E402).
  const screenOf = new Map<Node, Node>(all.map((w) => [w.node, w.screen]));
  const ids = [...byId.keys()];
  const unknown = (loc: Loc, id: string) => {
    const guess = closest(id, ids);
    add('E401', loc, `Line ${loc.line}: there is no #${id}.${guess ? ` Did you mean #${guess}?` : ''}`);
  };
  const targeted = new Set<string>();
  let anyLink = false;
  for (const w of all) {
    const n = w.node;
    if (skipped.has(n)) continue;
    if (n.link) {
      anyLink = true;
      const t = byId.get(n.link.to);
      if (!t) unknown(n.loc, n.link.to);
      else if (t.node.type !== 'screen' && !OVERLAYS.has(t.node.type)) {
        add(
          'E401',
          n.loc,
          `Line ${n.loc.line}: #${n.link.to} is a ${t.node.type}; a link must point at a screen, modal or drawer`,
        );
      } else if (OVERLAYS.has(t.node.type) && t.screen !== w.screen) {
        add('E402', n.loc, `Line ${n.loc.line}: #${n.link.to} is in a different screen`);
      } else if (t.node.type === 'screen') {
        targeted.add(n.link.to);
      }
    }
    if (n.type === 'note') {
      const f = n.attrs?.for;
      if (isRef(f)) {
        const t = byId.get(f.ref);
        if (!t) unknown(n.loc, f.ref);
        else if (screenOf.get(t.node) !== w.screen)
          add('E402', n.loc, `Line ${n.loc.line}: #${f.ref} is in a different screen`);
      }
    }
    if (n.type === 'screen') {
      const of = n.attrs?.of;
      if (isRef(of)) {
        const t = byId.get(of.ref);
        if (!t) unknown(n.loc, of.ref);
        else if (t.node.type !== 'screen') {
          add('E401', n.loc, `Line ${n.loc.line}: #${of.ref} is a ${t.node.type}; of= must name a screen`);
        } else if (isRef(t.node.attrs?.of)) {
          add(
            'E401',
            n.loc,
            `Line ${n.loc.line}: #${of.ref} is itself a variant; of= must name a screen that isn't`,
          );
        }
      }
    }
  }
  for (const f of doc.flows ?? []) {
    anyLink = true;
    for (const id of [f.from, f.to]) {
      const t = byId.get(id);
      if (!t) unknown(f.loc, id);
      else if (t.node.type !== 'screen')
        add('E401', f.loc, `Line ${f.loc.line}: #${id} is a ${t.node.type}; a flow links two screens`);
    }
    targeted.add(f.to);
  }

  // Unreachable screens (W403).
  if (anyLink) {
    doc.screens.forEach((s, i) => {
      if (i === 0 || isRef(s.attrs?.of)) return;
      if (s.id === undefined || !targeted.has(s.id)) {
        add('W403', s.loc, `Screen ${s.id ? `#${s.id}` : `"${s.label ?? ''}"`} is never reached`);
      }
    });
  }
  return out;
}

function placementProblem(n: Node, p: Node): string | undefined {
  switch (n.type) {
    case 'item':
      return p.type === 'list' || p.type === 'nav'
        ? undefined
        : '"item" must be directly inside a list or a nav';
    case 'note':
    case 'modal':
    case 'drawer':
    case 'header':
    case 'footer':
      return p.type === 'screen' ? undefined : `"${n.type}" must be directly inside a screen`;
    case 'sidebar':
      return p.type === 'screen' || p.type === 'row'
        ? undefined
        : '"sidebar" must be directly inside a screen or a row';
    default:
      if (p.type === 'table' && n.type !== 'table-row') return 'a table contains only rows';
      return undefined;
  }
}

/** True when a diagnostic list has an error. */
export function hasErrors(ds: Diagnostic[]): boolean {
  return ds.some((d) => d.severity === 'error');
}

/** Sorts diagnostics by line, column and code, and drops repeats (section 15). */
export function sortDiagnostics(ds: Diagnostic[]): Diagnostic[] {
  const sorted = [...ds].sort(
    (a, b) => a.line - b.line || a.column - b.column || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
  const out: Diagnostic[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && last.line === d.line && last.column === d.column && last.code === d.code) continue;
    out.push(d);
  }
  return out;
}
