// SPDX-License-Identifier: MIT

// Themes (spec section 9): the built-in themes, resolving a theme by name, and validating every
// token, whether it comes from a source or from the host.

import { diagnostic } from './parse.js';
import type { Diagnostic, Document, HostTheme, Loc, Options } from './types.js';

export type FontName = 'sans' | 'serif' | 'mono';

export interface Theme {
  name: string;
  color: {
    bg: string;
    surface: string;
    border: string;
    text: string;
    muted: string;
    primary: string;
    onPrimary: string;
    danger: string;
    success: string;
  };
  fontBody: FontName;
  fontHeading: FontName;
  radius: number;
  space: number;
  stroke: number;
}

type Tokens = Record<string, string | number>;

const PAPER: Tokens = {
  'color.bg': '#f4f5f7',
  'color.surface': '#ffffff',
  'color.border': '#9aa1ab',
  'color.text': '#22262b',
  'color.muted': '#6b7280',
  'color.primary': '#2c3138',
  'color.on-primary': '#ffffff',
  'color.danger': '#b42318',
  'color.success': '#1a7f4b',
  'font.body': 'sans',
  'font.heading': 'sans',
  radius: 6,
  space: 4,
  stroke: 1.5,
};

export const BUILTIN_THEMES: Record<string, Tokens> = {
  paper: PAPER,
  ink: {
    ...PAPER,
    'color.bg': '#16181c',
    'color.surface': '#1f2228',
    'color.border': '#5a6270',
    'color.text': '#e6e8eb',
    'color.muted': '#9aa2ae',
    'color.primary': '#e6e8eb',
    'color.on-primary': '#16181c',
    'color.danger': '#f2705f',
    'color.success': '#4cc38a',
  },
  blueprint: {
    ...PAPER,
    'color.bg': '#f2f6fc',
    'color.surface': '#ffffff',
    'color.border': '#3f6fc0',
    'color.text': '#1d4a96',
    'color.muted': '#4f74b8',
    'color.primary': '#1d4a96',
    'color.on-primary': '#ffffff',
    'color.danger': '#1d4a96',
    'color.success': '#1d4a96',
    radius: 2,
  },
};

/** Token names in the order of section 9.2. */
export const TOKEN_NAMES = Object.keys(PAPER);
export const COLOR_TOKENS = TOKEN_NAMES.filter((t) => t.startsWith('color.'));

const COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const NUM = /^-?[0-9]+(\.[0-9]+)?$/;
const MAX_EXTENDS = 4;

/** Checks and normalises one token value. Returns null when it's invalid, with the reason. */
export function checkToken(
  token: string,
  value: string | number,
): { value: string | number } | { problem: string } {
  if (token.startsWith('color.')) {
    if (typeof value !== 'string' || !COLOR.test(value)) {
      return { problem: `${token} must be a colour written #rgb or #rrggbb` };
    }
    let hex = value.slice(1).toLowerCase();
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    return { value: `#${hex}` };
  }
  if (token === 'font.body' || token === 'font.heading') {
    if (value === 'sans' || value === 'serif' || value === 'mono') return { value };
    return { problem: `${token} must be sans, serif or mono` };
  }
  const n = typeof value === 'number' ? value : NUM.test(String(value)) ? Number(value) : Number.NaN;
  if (token === 'radius') {
    return Number.isInteger(n) && n >= 0 && n <= 16
      ? { value: n }
      : { problem: 'radius must be a whole number from 0 to 16' };
  }
  if (token === 'space') {
    return Number.isInteger(n) && n >= 2 && n <= 8
      ? { value: n }
      : { problem: 'space must be a whole number from 2 to 8' };
  }
  if (token === 'stroke') {
    return Number.isFinite(n) && n >= 1 && n <= 3 && Number.isInteger(n * 2)
      ? { value: n }
      : { problem: 'stroke must be from 1 to 3, in steps of 0.5' };
  }
  return { problem: `there is no token "${token}"` };
}

/** WCAG 2 relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const ch = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}

/** WCAG 2 contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

interface Source {
  tokens: Tokens;
  extends?: string;
  /** Where to report problems with this theme's tokens. */
  lineOf: (token: string) => Loc;
}

/**
 * Resolves the theme a source uses, reporting W502 to W505 and E506 (section 9). Never throws:
 * every problem falls back to an inherited value.
 */
export function resolveTheme(
  doc: Document,
  options: Options,
  tokenLines: Record<string, number>,
  diagnostics: Diagnostic[],
): Theme {
  const decl = doc.theme;
  const themeLoc: Loc = decl?.loc ?? { line: 1, column: 1 };
  const hostLoc = decl?.loc ?? { line: 1, column: 1 };
  const hosts = options.themes ?? {};
  const isBlock = decl?.tokens !== undefined;

  const lookup = (name: string): Source | undefined => {
    if (isBlock && decl && name === decl.name) {
      const s: Source = {
        tokens: decl.tokens ?? {},
        lineOf: (t) => ({ line: tokenLines[t] ?? themeLoc.line, column: 3 }),
      };
      if (decl.extends !== undefined) s.extends = decl.extends;
      return s;
    }
    if (Object.hasOwn(hosts, name)) {
      const h = hosts[name] as HostTheme;
      const s: Source = { tokens: h.tokens ?? {}, lineOf: () => hostLoc };
      if (h.extends !== undefined) s.extends = h.extends;
      return s;
    }
    if (Object.hasOwn(BUILTIN_THEMES, name)) {
      return { tokens: BUILTIN_THEMES[name] as Tokens, lineOf: () => themeLoc };
    }
    return undefined;
  };

  // Which theme to use.
  const fallback = options.defaultTheme ?? 'paper';
  let name = decl?.name ?? fallback;
  if (!lookup(name)) {
    const using = lookup(fallback) ? fallback : 'paper';
    diagnostics.push(diagnostic('W502', themeLoc, `There is no theme "${name}"; using ${using}`));
    name = using;
  }

  // Follow the extends chain from the chosen theme down to a built-in.
  const chain: { name: string; source: Source }[] = [];
  const seen = new Set<string>();
  let current: string | undefined = name;
  while (current !== undefined) {
    const source = lookup(current);
    if (!source) break;
    if (seen.has(current)) {
      diagnostics.push(diagnostic('E506', themeLoc, `Theme "${current}" extends itself`));
      break;
    }
    seen.add(current);
    chain.push({ name: current, source });
    if (chain.length > MAX_EXTENDS + 1) {
      diagnostics.push(
        diagnostic('E506', themeLoc, `Theme "${name}" extends more than ${MAX_EXTENDS} themes deep`),
      );
      break;
    }
    const isBuiltin = !(isBlock && current === decl?.name) && !Object.hasOwn(hosts, current);
    if (isBuiltin) break;
    const next: string = source.extends ?? 'paper';
    if (!lookup(next)) {
      diagnostics.push(diagnostic('W502', themeLoc, `There is no theme "${next}" to extend; using paper`));
      current = 'paper';
    } else {
      current = next;
    }
  }

  // Apply tokens from the base up, validating each one.
  const tokens: Tokens = { ...PAPER };
  for (const { source } of [...chain].reverse()) {
    for (const [token, value] of Object.entries(source.tokens)) {
      if (!TOKEN_NAMES.includes(token)) {
        diagnostics.push(
          diagnostic(
            'W503',
            source.lineOf(token),
            `Line ${source.lineOf(token).line}: there is no token "${token}"`,
          ),
        );
        continue;
      }
      const r = checkToken(token, value);
      if ('problem' in r) {
        diagnostics.push(
          diagnostic('W504', source.lineOf(token), `Line ${source.lineOf(token).line}: ${r.problem}`),
        );
        continue;
      }
      tokens[token] = r.value;
    }
  }

  const theme: Theme = {
    name,
    color: {
      bg: String(tokens['color.bg']),
      surface: String(tokens['color.surface']),
      border: String(tokens['color.border']),
      text: String(tokens['color.text']),
      muted: String(tokens['color.muted']),
      primary: String(tokens['color.primary']),
      onPrimary: String(tokens['color.on-primary']),
      danger: String(tokens['color.danger']),
      success: String(tokens['color.success']),
    },
    fontBody: tokens['font.body'] as FontName,
    fontHeading: tokens['font.heading'] as FontName,
    radius: Number(tokens.radius),
    space: Number(tokens.space),
    stroke: Number(tokens.stroke),
  };

  for (const [a, b, what] of [
    [theme.color.text, theme.color.surface, 'Text on surface'],
    [theme.color.onPrimary, theme.color.primary, 'On-primary on primary'],
  ] as const) {
    const ratio = contrast(a, b);
    if (ratio < 3) {
      diagnostics.push(
        diagnostic('W505', themeLoc, `${what} has contrast ${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`),
      );
    }
  }
  return theme;
}
