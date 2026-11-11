// SPDX-License-Identifier: MIT

// What each component accepts (spec section 5).

export interface ComponentSpec {
  /** Flags it defines. */
  flags: readonly string[];
  /** Attributes it defines, besides the common ones. */
  attrs: readonly string[];
  /** Whether its first string means something. */
  label: boolean;
  /** Whether its first list means something. */
  items: boolean;
  /** Whether it takes children. */
  children: boolean;
}

const C = (
  flags: string[],
  attrs: string[],
  label: boolean,
  items: boolean,
  children: boolean,
): ComponentSpec => ({ flags, attrs, label, items, children });

const BOX = ['gap', 'pad', 'align', 'justify'];

export const COMPONENTS: Record<string, ComponentSpec> = {
  screen: C(['phone', 'tablet', 'desktop'], ['size', 'of', 'state'], true, false, true),
  row: C(['wrap'], BOX, false, false, true),
  column: C([], BOX, false, false, true),
  grid: C([], ['cols', 'gap', 'pad'], false, false, true),
  spacer: C([], ['size'], false, false, false),
  divider: C([], [], false, false, false),
  header: C([], BOX, false, false, true),
  footer: C([], BOX, false, false, true),
  sidebar: C(['right'], [], false, false, true),
  nav: C(['vertical'], ['active'], false, true, true),
  tabs: C([], ['active'], false, true, true),
  breadcrumbs: C([], [], false, true, false),
  h1: C([], ['align'], true, false, false),
  h2: C([], ['align'], true, false, false),
  h3: C([], ['align'], true, false, false),
  text: C(['muted'], ['align', 'lines'], true, false, false),
  label: C(['muted'], [], true, false, false),
  button: C(['primary', 'secondary', 'danger', 'disabled', 'sm', 'lg'], ['icon'], true, false, false),
  link: C(['disabled'], [], true, false, false),
  input: C(['required', 'disabled'], ['placeholder', 'value', 'type', 'error'], true, false, false),
  textarea: C([], ['placeholder', 'value', 'rows'], true, false, false),
  select: C(['disabled'], ['value', 'placeholder'], true, true, false),
  checkbox: C(['checked', 'disabled'], [], true, false, false),
  radio: C(['disabled'], ['value'], true, true, false),
  toggle: C(['on', 'disabled'], [], true, false, false),
  table: C([], ['rows'], true, true, true),
  'table-row': C(['selected'], [], false, true, false),
  list: C(['ordered'], [], false, true, true),
  item: C(['active'], ['icon', 'badge'], true, false, false),
  card: C([], ['pad', 'gap'], true, false, true),
  image: C([], ['ratio'], true, false, false),
  icon: C(['sm', 'lg'], [], true, false, false),
  badge: C(['primary', 'danger', 'success'], [], true, false, false),
  avatar: C(['sm', 'lg'], [], true, false, false),
  modal: C(['open'], [], true, false, true),
  drawer: C(['open', 'right', 'left', 'bottom'], [], true, false, true),
  empty: C([], [], true, false, true),
  loading: C([], [], true, false, false),
  error: C([], [], true, false, true),
  note: C([], ['for'], true, false, false),
};

/** Flags and attributes every element accepts (spec section 5.10). */
export const COMMON_FLAGS = ['grow'];
export const COMMON_ATTRS = ['width', 'height', 'span'];

/** Component names a source may write. `table-row` is written as `row`. */
export const WRITTEN_NAMES = Object.keys(COMPONENTS).filter((n) => n !== 'table-row');

export const OVERLAYS = new Set(['modal', 'drawer']);
export const SIZES = ['none', 'xs', 'sm', 'md', 'lg', 'xl'];
export const ALIGNS = ['start', 'center', 'end', 'stretch'];
export const JUSTIFIES = ['start', 'center', 'end', 'between'];
export const INPUT_TYPES = ['text', 'password', 'email', 'number', 'search', 'date'];

export const DEVICES: Record<string, [number, number]> = {
  phone: [390, 844],
  tablet: [820, 1180],
  desktop: [1280, 800],
};

/** Common names people write for a component, for "did you mean" hints (spec section 5). */
export const SYNONYMS: Record<string, string> = {
  textfield: 'input',
  textbox: 'input',
  field: 'input',
  dropdown: 'select',
  combobox: 'select',
  picker: 'select',
  navbar: 'nav',
  navigation: 'nav',
  menu: 'nav',
  menubar: 'nav',
  container: 'column',
  div: 'column',
  stack: 'column',
  vstack: 'column',
  hstack: 'row',
  paragraph: 'text',
  p: 'text',
  span: 'text',
  heading: 'h1',
  title: 'h1',
  img: 'image',
  picture: 'image',
  photo: 'image',
  switch: 'toggle',
  dialog: 'modal',
  popup: 'modal',
  sheet: 'drawer',
  panel: 'drawer',
  chip: 'badge',
  tag: 'badge',
  pill: 'badge',
  separator: 'divider',
  hr: 'divider',
  section: 'card',
  box: 'card',
  spinner: 'loading',
  alert: 'error',
  placeholder: 'empty',
  tab: 'tabs',
  crumbs: 'breadcrumbs',
  options: 'radio',
  textinput: 'input',
  password: 'input',
  menuitem: 'item',
  li: 'item',
  ul: 'list',
  ol: 'list',
  tr: 'row',
  td: 'text',
};

/** The edit distance between two strings, for "did you mean" hints. */
export function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + cost);
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

/**
 * The closest candidate within a small distance, or undefined. Ties go to the earliest
 * candidate in the order given.
 */
export function closest(word: string, candidates: Iterable<string>): string | undefined {
  const lower = word.toLowerCase();
  let best: string | undefined;
  let bestD = Math.max(2, Math.floor(word.length / 3)) + 1;
  for (const c of candidates) {
    const d = distance(lower, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
