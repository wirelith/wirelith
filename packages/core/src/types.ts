// SPDX-License-Identifier: MIT

/** A position in a source: line and column, both from 1. Columns count Unicode code points. */
export interface Loc {
  line: number;
  column: number;
}

/** An attribute value: a number, a string, a list of strings, or a reference to an id. */
export type Value = string | number | string[] | { ref: string };

export interface Link {
  to: string;
  label?: string;
}

/** An element of the syntax tree (spec section 13). */
export interface Node {
  type: string;
  id?: string;
  label?: string;
  items?: string[];
  flags?: string[];
  attrs?: Record<string, Value>;
  link?: Link;
  children?: Node[];
  loc: Loc;
}

export interface Flow {
  from: string;
  to: string;
  label?: string;
  loc: Loc;
}

export interface ThemeDecl {
  name: string;
  extends?: string;
  tokens?: Record<string, string | number>;
  loc?: Loc;
}

/** The syntax tree of a source (spec section 13). */
export interface Document {
  type: 'document';
  version: string;
  theme?: ThemeDecl;
  screens: Node[];
  flows?: Flow[];
}

export type Severity = 'error' | 'warning';

/** A diagnostic with a stable code (spec section 15). */
export interface Diagnostic {
  code: string;
  severity: Severity;
  line: number;
  column: number;
  message: string;
  hint?: string;
}

/** A theme supplied by a host (spec section 9.4). */
export interface HostTheme {
  extends?: string;
  tokens?: Record<string, string | number>;
}

/** Render options (spec section 8). */
export interface Options {
  themes?: Record<string, HostTheme>;
  defaultTheme?: string;
  screen?: string;
  flows?: boolean;
  notes?: boolean;
  idPrefix?: string;
  embedSource?: boolean;
}

/** The outline of a source (spec section 13.2). */
export interface Outline {
  screens: OutlineScreen[];
  links: OutlineLink[];
}

export interface OutlineScreen {
  id: string;
  title: string;
  device: { name: 'phone' | 'tablet' | 'desktop' | 'custom'; width: number; height: number };
  of?: string;
  state?: string;
  overlays: { id: string; type: 'modal' | 'drawer'; title?: string; open: boolean }[];
}

export interface OutlineLink {
  kind: 'element' | 'flow';
  from: { screen: string; element?: { id?: string; index: number; type: string; line: number } };
  to: string;
  label?: string;
}
