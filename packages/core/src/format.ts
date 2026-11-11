// SPDX-License-Identifier: MIT

// The formatter: writes a source in canonical form, keeping its comments. Formatting never
// changes what a source means: the syntax tree of the result is the same as the original's,
// apart from positions.
//
// Canonical form:
// - starts with the version line, `wirelith 0.1`, adding it if it is missing;
// - indents with two spaces per level, and comment lines at the level of the line after them;
// - writes each element's parts in the order of section 4: label, list, flags, attributes, id,
//   then the link;
// - quotes a string only where it must be quoted;
// - keeps a single blank line where the source had one or more, and none at the start or end;
// - uses LF line endings, with no byte-order mark and no trailing spaces.

import {
  BARE,
  LineError,
  NUMBER,
  normalizeSource,
  parse,
  SPEC_VERSION,
  type Token,
  tokenize,
} from './parse.js';
import type { Value } from './types.js';

const BARE_WORD = new RegExp(`^${BARE.source.slice(1, -1)}+$`);

/** A string in double quotes, with the escapes of section 3. */
export function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** A list item: bare where that reads back as the same text, otherwise quoted. */
function item(s: string): string {
  const bare = s !== '' && s === s.trim() && !/[,[\]"\n]/.test(s) && !s.startsWith('#');
  return bare ? s : quote(s);
}

function list(items: string[]): string {
  return `[${items.map(item).join(', ')}]`;
}

function value(v: Value): string {
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return list(v);
  if (typeof v === 'object') return `#${v.ref}`;
  // A string stays bare only if it reads back as the same string, not as a number.
  return BARE_WORD.test(v) && !NUMBER.test(v) ? v : quote(v);
}

/** One element line, in canonical order. */
function element(tokens: Token[]): string {
  const [head, ...rest] = tokens;
  const name = head?.kind === 'word' ? head.text : '';
  let label: string | undefined;
  let items: string[] | undefined;
  let id: string | undefined;
  const flags: string[] = [];
  const attrs: string[] = [];
  let link = '';
  for (let k = 0; k < rest.length; k++) {
    const t = rest[k] as Token;
    if (t.kind === 'arrow') {
      const target = rest[k + 1];
      const lab = rest[k + 2];
      if (target?.kind === 'id') link = ` -> #${target.text}`;
      if (lab?.kind === 'string') link += ` ${quote(lab.text)}`;
      break;
    }
    if (t.kind === 'string') label = t.text;
    else if (t.kind === 'list') items = t.items;
    else if (t.kind === 'id') id = t.text;
    else if (t.kind === 'word' && !flags.includes(t.text)) flags.push(t.text);
    else if (t.kind === 'attr') attrs.push(`${t.key}=${value(t.value)}`);
  }
  const parts = [name];
  if (label !== undefined) parts.push(quote(label));
  if (items !== undefined) parts.push(list(items));
  parts.push(...flags, ...attrs);
  if (id !== undefined) parts.push(`#${id}`);
  return parts.join(' ') + link;
}

interface Out {
  level: number | null;
  text: string;
}

/**
 * Formats a source. Returns null when the source has syntax errors, because a source that
 * can't be read can't be rewritten safely.
 */
export function format(input: string): string | null {
  const p = parse(input);
  if (p.diagnostics.some((d) => d.severity === 'error')) return null;
  const lines = normalizeSource(input).split(/\r\n|\n|\r/);
  const out: Out[] = [];
  let hasHeader = false;
  let themeBlock = false;
  for (let n = 0; n < lines.length; n++) {
    const cp = Array.from((lines[n] ?? '').replace(/ +$/, ''));
    let indent = 0;
    while (cp[indent] === ' ') indent++;
    if (indent === cp.length) {
      out.push({ level: null, text: '' });
      continue;
    }
    if (cp[indent] === '/' && cp[indent + 1] === '/') {
      out.push({ level: -1, text: cp.slice(indent).join('') });
      continue;
    }
    const level = indent / 2;
    if (level === 0) themeBlock = false;
    if (themeBlock && level === 1) {
      // A theme token line: the token, then its value as written.
      let k = indent;
      let token = '';
      while (k < cp.length && cp[k] !== ' ') token += cp[k++];
      let rest = cp.slice(k).join('');
      let comment = '';
      const c = rest.search(/ \/\//);
      if (c >= 0) {
        comment = ` ${rest.slice(c + 1).trim()}`;
        rest = rest.slice(0, c);
      }
      out.push({ level, text: `${token} ${rest.trim()}${comment}` });
      continue;
    }
    const info: { comment?: string } = {};
    let tokens: Token[];
    try {
      tokens = tokenize(cp, indent, n + 1, info);
    } catch (e) {
      if (e instanceof LineError) return null;
      throw e;
    }
    const head = tokens[0];
    const name = head?.kind === 'word' ? head.text : '';
    let text: string;
    if (level === 0 && name === 'wirelith') {
      hasHeader = true;
      text = `wirelith ${tokens[1]?.kind === 'word' ? tokens[1].text : SPEC_VERSION}`;
    } else if (level === 0 && name === 'theme') {
      const t = tokens[1];
      if (t?.kind === 'string') {
        themeBlock = true;
        const ext = tokens.find((x) => x.kind === 'attr' && x.key === 'extends');
        text = `theme ${quote(t.text)}${ext?.kind === 'attr' ? ` extends=${value(ext.value)}` : ''}`;
      } else {
        text = `theme ${t?.kind === 'word' ? t.text : ''}`;
      }
    } else if (level === 0 && name === 'flow') {
      const [, from, , to, label] = tokens;
      text = `flow #${from?.kind === 'id' ? from.text : ''} -> #${to?.kind === 'id' ? to.text : ''}`;
      if (label?.kind === 'string') text += ` ${quote(label.text)}`;
    } else {
      text = element(tokens);
    }
    if (info.comment !== undefined) text += ` ${info.comment}`;
    out.push({ level, text });
  }

  // Comment lines take the level of the next line that isn't blank or a comment.
  let next = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    const o = out[i] as Out;
    if (o.level === -1) o.level = next;
    else if (o.level !== null) next = o.level;
  }

  const result: string[] = [];
  if (!hasHeader) result.push(`wirelith ${SPEC_VERSION}`, '');
  for (const o of out) {
    if (o.level === null) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('');
      continue;
    }
    result.push(`${'  '.repeat(o.level)}${o.text}`);
  }
  while (result.length > 0 && result[result.length - 1] === '') result.pop();
  return result.length > 0 ? `${result.join('\n')}\n` : '';
}
