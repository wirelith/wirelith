// SPDX-License-Identifier: MIT

// The parser (spec sections 3 and 4). It reads a source line by line and builds the syntax tree
// (section 13). A line with a syntax error is reported, then skipped together with its children,
// and parsing continues, so that every error can be reported at once.

import { COMPONENTS, closest, own, SYNONYMS, setOwn, WRITTEN_NAMES } from './components.js';
import type { Diagnostic, Document, Flow, Loc, Node, ThemeDecl, Value } from './types.js';

export const SPEC_VERSION = '0.1';
export const MAX_SOURCE_BYTES = 65536;

export interface ParseResult {
  tree: Document;
  diagnostics: Diagnostic[];
  /** True when the source-size cap was exceeded and nothing else was read. */
  tooLarge: boolean;
  /** The line of each token in the source's theme block. */
  tokenLines: Record<string, number>;
}

export function diagnostic(code: string, loc: Loc, message: string, hint?: string): Diagnostic {
  const d: Diagnostic = {
    code,
    severity: code.startsWith('E') ? 'error' : 'warning',
    line: loc.line,
    column: loc.column,
    message,
  };
  if (hint !== undefined) d.hint = hint;
  return d;
}

/** Applies the decoding rules of section 3: drops a byte-order mark, replaces lone surrogates. */
export function normalizeSource(input: string): string {
  let s = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
  return s;
}

/** The number of bytes the string takes in UTF-8. */
export function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

export const BARE = /^[A-Za-z0-9\-_.:%/]$/;
export const NUMBER = /^-?[0-9]+(\.[0-9]+)?$/;
const ID_START = /^[A-Za-z]$/;
const ID_REST = /^[A-Za-z0-9_-]$/;
const VERSION = /^[0-9]+\.[0-9]+$/;

export type Token =
  | { kind: 'word'; text: string; col: number }
  | { kind: 'string'; text: string; col: number }
  | { kind: 'list'; items: string[]; col: number }
  | { kind: 'id'; text: string; col: number }
  | { kind: 'arrow'; col: number }
  | { kind: 'attr'; key: string; value: Value; col: number };

export class LineError extends Error {
  constructor(
    readonly code: string,
    readonly col: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Splits the content of one line (as code points, from `start`) into tokens. When `info` is
 * given, a trailing comment's text is put in `info.comment`.
 */
export function tokenize(cp: string[], start: number, line: number, info?: { comment?: string }): Token[] {
  const tokens: Token[] = [];
  let i = start;
  const col = () => i + 1;
  const at = (k: number) => cp[k] ?? '';
  const endOfPart = (k: number) => k >= cp.length || cp[k] === ' ';

  const readString = (): string => {
    const startCol = col();
    i++; // opening quote
    let out = '';
    for (;;) {
      if (i >= cp.length)
        throw new LineError(
          'E104',
          startCol,
          `Line ${line}, column ${startCol}: this string has no closing quote`,
        );
      const c = at(i);
      if (c === '"') {
        i++;
        return out;
      }
      if (c === '\\') {
        const n = at(i + 1);
        if (n === '"' || n === '\\') out += n;
        else if (n === 'n') out += '\n';
        else
          throw new LineError(
            'E106',
            col(),
            `Line ${line}, column ${col()}: "\\${n}" is not an escape; use \\", \\\\ or \\n`,
          );
        i += 2;
        continue;
      }
      out += c;
      i++;
    }
  };

  const readList = (): string[] => {
    const startCol = col();
    i++; // [
    const items: string[] = [];
    // An empty list.
    let k = i;
    while (at(k) === ' ') k++;
    if (at(k) === ']') {
      i = k + 1;
      return items;
    }
    for (;;) {
      while (at(i) === ' ') i++;
      if (i >= cp.length)
        throw new LineError(
          'E104',
          startCol,
          `Line ${line}, column ${startCol}: this list has no closing bracket`,
        );
      let item: string;
      if (at(i) === '"') {
        item = readString();
        while (at(i) === ' ') i++;
      } else {
        const itemCol = col();
        let raw = '';
        while (i < cp.length && at(i) !== ',' && at(i) !== ']' && at(i) !== '[' && at(i) !== '"') {
          raw += at(i);
          i++;
        }
        if (at(i) === '"' || at(i) === '[') {
          throw new LineError(
            'E106',
            col(),
            `Line ${line}, column ${col()}: quote the whole item, or leave out the "${at(i)}"`,
          );
        }
        item = raw.trim();
        if (item === '' && i < cp.length) {
          throw new LineError(
            'E106',
            itemCol,
            `Line ${line}, column ${itemCol}: this list has an empty item`,
          );
        }
      }
      if (i >= cp.length)
        throw new LineError(
          'E104',
          startCol,
          `Line ${line}, column ${startCol}: this list has no closing bracket`,
        );
      items.push(item);
      if (at(i) === ',') {
        i++;
        continue;
      }
      if (at(i) === ']') {
        i++;
        return items;
      }
      throw new LineError(
        'E106',
        col(),
        `Line ${line}, column ${col()}: expected "," or "]" after a quoted item`,
      );
    }
  };

  const readId = (): string => {
    const startCol = col();
    i++; // #
    let id = '';
    if (!ID_START.test(at(i))) {
      throw new LineError(
        'E106',
        startCol,
        `Line ${line}, column ${startCol}: an id is # then a letter, then letters, digits, - or _`,
      );
    }
    while (i < cp.length && ID_REST.test(at(i))) {
      id += at(i);
      i++;
    }
    return id;
  };

  const readBare = (): string => {
    let w = '';
    while (i < cp.length && BARE.test(at(i))) {
      w += at(i);
      i++;
    }
    return w;
  };

  const requireEnd = () => {
    if (!endOfPart(i)) {
      throw new LineError(
        'E106',
        col(),
        `Line ${line}, column ${col()}: unexpected "${at(i)}"; put a space between parts, and quote text`,
      );
    }
  };

  while (i < cp.length) {
    if (at(i) === ' ') {
      i++;
      continue;
    }
    // A trailing comment: "//" after at least one space.
    if (at(i) === '/' && at(i + 1) === '/' && i > start && at(i - 1) === ' ') {
      if (info) info.comment = cp.slice(i).join('').trimEnd();
      break;
    }
    const c = col();
    const ch = at(i);
    if (ch === '"') {
      tokens.push({ kind: 'string', text: readString(), col: c });
      requireEnd();
    } else if (ch === '[') {
      tokens.push({ kind: 'list', items: readList(), col: c });
      requireEnd();
    } else if (ch === '#') {
      tokens.push({ kind: 'id', text: readId(), col: c });
      requireEnd();
    } else if (ch === '-' && at(i + 1) === '>' && endOfPart(i + 2)) {
      i += 2;
      tokens.push({ kind: 'arrow', col: c });
    } else if (BARE.test(ch)) {
      const word = readBare();
      if (at(i) === '=') {
        i++;
        const vc = col();
        let value: Value;
        if (endOfPart(i)) {
          throw new LineError('E106', vc, `Line ${line}, column ${vc}: expected a value after "${word}="`);
        } else if (at(i) === '"') {
          value = readString();
        } else if (at(i) === '[') {
          value = readList();
        } else if (at(i) === '#') {
          value = { ref: readId() };
        } else if (BARE.test(at(i))) {
          const b = readBare();
          value = NUMBER.test(b) ? Number(b) : b;
        } else {
          throw new LineError(
            'E106',
            vc,
            `Line ${line}, column ${vc}: "${at(i)}" can't start a value; quote it`,
          );
        }
        requireEnd();
        tokens.push({ kind: 'attr', key: word, value, col: c });
      } else {
        requireEnd();
        tokens.push({ kind: 'word', text: word, col: c });
      }
    } else {
      throw new LineError(
        'E106',
        c,
        `Line ${line}, column ${c}: "${ch}" can't appear here; put text in double quotes`,
      );
    }
  }
  return tokens;
}

/** Builds an element from the tokens of one line. Throws LineError on a malformed line. */
function buildElement(tokens: Token[], line: number, type: string): Node {
  const first = tokens[0];
  const node: Node = { type, loc: { line, column: first?.col ?? 1 } };
  let label: string | undefined;
  let items: string[] | undefined;
  let id: string | undefined;
  const flags: string[] = [];
  const attrs: Record<string, Value> = {};
  let attrCount = 0;
  let link: Node['link'];
  for (let k = 1; k < tokens.length; k++) {
    const t = tokens[k] as Token;
    if (t.kind === 'arrow') {
      const target = tokens[k + 1];
      if (target?.kind !== 'id') {
        throw new LineError(
          'E106',
          t.col,
          `Line ${line}, column ${t.col}: "->" needs a target id, such as -> #home`,
        );
      }
      link = { to: target.text };
      const lab = tokens[k + 2];
      if (lab && lab.kind === 'string') link.label = lab.text;
      const extra = tokens[k + (lab && lab.kind === 'string' ? 3 : 2)];
      if (extra) {
        throw new LineError(
          'E106',
          extra.col,
          `Line ${line}, column ${extra.col}: the link must come last on the line`,
        );
      }
      break;
    }
    if (t.kind === 'string') {
      if (label !== undefined)
        throw new LineError('E106', t.col, `Line ${line}, column ${t.col}: an element has only one label`);
      label = t.text;
    } else if (t.kind === 'list') {
      if (items !== undefined)
        throw new LineError('E106', t.col, `Line ${line}, column ${t.col}: an element has only one list`);
      items = t.items;
    } else if (t.kind === 'id') {
      if (id !== undefined)
        throw new LineError('E106', t.col, `Line ${line}, column ${t.col}: an element has only one id`);
      id = t.text;
    } else if (t.kind === 'word') {
      if (!flags.includes(t.text)) flags.push(t.text);
    } else if (t.kind === 'attr') {
      setOwn(attrs, t.key, t.value);
      attrCount++;
    }
  }
  // Members in schema order: type, id, label, items, flags, attrs, link, children, loc.
  const out = { type: node.type } as Node;
  if (id !== undefined) out.id = id;
  if (label !== undefined) out.label = label;
  if (items !== undefined) out.items = items;
  if (flags.length > 0) out.flags = flags;
  if (attrCount > 0) out.attrs = attrs;
  if (link) out.link = link;
  out.loc = node.loc;
  return out;
}

interface Frame {
  level: number;
  kind: 'skip' | 'node' | 'leafless' | 'theme-block';
  node?: Node;
}

/** Parses a source into its syntax tree and the syntax diagnostics. */
export function parse(input: string): ParseResult {
  const text = normalizeSource(input);
  const diagnostics: Diagnostic[] = [];
  const tree: Document = { type: 'document', version: SPEC_VERSION, screens: [] };
  if (utf8Length(text) > MAX_SOURCE_BYTES) {
    diagnostics.push(
      diagnostic(
        'E701',
        { line: 1, column: 1 },
        `This source is ${utf8Length(text).toLocaleString('en-US')} bytes; the limit is ${MAX_SOURCE_BYTES.toLocaleString('en-US')}`,
      ),
    );
    return { tree, diagnostics, tooLarge: true, tokenLines: {} };
  }

  const lines = text.split(/\r\n|\n|\r/);
  const flows: Flow[] = [];
  let theme: ThemeDecl | undefined;
  let themeLine = 0;
  let sawSignificant = false;
  const stack: Frame[] = [];
  const tokenLines: Record<string, number> = {};

  for (let n = 0; n < lines.length; n++) {
    const lineNo = n + 1;
    const cp = Array.from(lines[n] ?? '');
    // Indentation.
    let indent = 0;
    while (cp[indent] === ' ') indent++;
    if (indent === cp.length) continue; // blank
    const rest = cp[indent];
    if (rest === '\t') {
      diagnostics.push(
        diagnostic('E102', { line: lineNo, column: indent + 1 }, `Line ${lineNo}: use 2 spaces, not a tab`),
      );
      pushSkip(stack, Math.floor(indent / 2));
      continue;
    }
    // Characters that are not allowed.
    const bad = cp.findIndex((c) => {
      const v = c.codePointAt(0) ?? 0;
      return (v < 0x20 && v !== 0x0a && v !== 0x0d) || v === 0x7f || v === 0xfffe || v === 0xffff;
    });
    if (bad >= 0) {
      const v = (cp[bad] ?? '').codePointAt(0) ?? 0;
      diagnostics.push(
        diagnostic(
          'E106',
          { line: lineNo, column: bad + 1 },
          `Line ${lineNo}, column ${bad + 1}: the character U+${v.toString(16).toUpperCase().padStart(4, '0')} is not allowed in a source`,
        ),
      );
      pushSkip(stack, Math.floor(indent / 2));
      continue;
    }
    if (rest === '/' && cp[indent + 1] === '/') continue; // comment line
    if (indent % 2 !== 0) {
      diagnostics.push(
        diagnostic(
          'E101',
          { line: lineNo, column: 1 },
          `Line ${lineNo}: indentation must be a multiple of 2 spaces`,
        ),
      );
      pushSkip(stack, Math.floor(indent / 2));
      continue;
    }
    const level = indent / 2;
    while (stack.length > 0 && (stack[stack.length - 1] as Frame).level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    const loc = { line: lineNo, column: indent + 1 };

    if (parent && level > parent.level + 1) {
      diagnostics.push(
        diagnostic(
          'E101',
          loc,
          `Line ${lineNo}: this line is indented more than one level below the line above it`,
        ),
      );
      stack.push({ level, kind: 'skip' });
      continue;
    }
    if (!parent && level > 0) {
      diagnostics.push(
        diagnostic(
          'E101',
          loc,
          `Line ${lineNo}: this line is indented, but there is nothing above it to belong to`,
        ),
      );
      stack.push({ level, kind: 'skip' });
      continue;
    }
    if (parent?.kind === 'skip') {
      stack.push({ level, kind: 'skip' });
      continue;
    }

    // A token line in a theme block.
    if (parent?.kind === 'theme-block') {
      let k = indent;
      let token = '';
      while (k < cp.length && cp[k] !== ' ') token += cp[k++];
      let valueText = cp.slice(k).join('');
      const comment = valueText.search(/ \/\//);
      if (comment >= 0) valueText = valueText.slice(0, comment);
      valueText = valueText.trim();
      if (valueText === '') {
        diagnostics.push(
          diagnostic(
            'E106',
            { line: lineNo, column: k + 1 },
            `Line ${lineNo}: expected a value after "${token}"`,
          ),
        );
        stack.push({ level, kind: 'skip' });
        continue;
      }
      if (theme) {
        theme.tokens ??= {};
        setOwn(theme.tokens, token, NUMBER.test(valueText) ? Number(valueText) : valueText);
        setOwn(tokenLines, token, lineNo);
      }
      stack.push({ level, kind: 'skip' });
      continue;
    }

    let tokens: Token[];
    try {
      tokens = tokenize(cp, indent, lineNo);
    } catch (e) {
      if (!(e instanceof LineError)) throw e;
      diagnostics.push(diagnostic(e.code, { line: lineNo, column: e.col }, e.message));
      stack.push({ level, kind: 'skip' });
      continue;
    }
    const head = tokens[0];
    const name = head && head.kind === 'word' ? head.text : '';
    const isFirst = !sawSignificant;
    sawSignificant = true;

    if (level === 0) {
      if (name === 'wirelith') {
        if (!isFirst) {
          diagnostics.push(
            diagnostic('E105', loc, `Line ${lineNo}: "wirelith ${SPEC_VERSION}" must be the first line`),
          );
        } else {
          readHeader(tokens, lineNo, tree, diagnostics);
          if (diagnostics.some((d) => d.code === 'E103'))
            return { tree, diagnostics, tooLarge: false, tokenLines };
        }
        stack.push({ level, kind: 'leafless' });
        continue;
      }
      if (name === 'theme') {
        if (theme) {
          diagnostics.push(
            diagnostic(
              'E501',
              loc,
              `Line ${lineNo}: a source can have only one theme; the first is on line ${themeLine}`,
            ),
          );
          stack.push({ level, kind: 'skip' });
          continue;
        }
        try {
          const decl = readTheme(tokens, lineNo);
          theme = decl.theme;
          themeLine = lineNo;
          stack.push({ level, kind: decl.block ? 'theme-block' : 'leafless' });
        } catch (e) {
          if (!(e instanceof LineError)) throw e;
          diagnostics.push(diagnostic(e.code, { line: lineNo, column: e.col }, e.message));
          stack.push({ level, kind: 'skip' });
        }
        continue;
      }
      if (name === 'flow') {
        try {
          flows.push(readFlow(tokens, lineNo));
          stack.push({ level, kind: 'leafless' });
        } catch (e) {
          if (!(e instanceof LineError)) throw e;
          diagnostics.push(diagnostic(e.code, { line: lineNo, column: e.col }, e.message));
          stack.push({ level, kind: 'skip' });
        }
        continue;
      }
      if (name !== 'screen') {
        const what = name || 'this line';
        diagnostics.push(
          diagnostic(
            'E105',
            loc,
            `Line ${lineNo}: "${what}" must be inside a screen; only screen, theme and flow go at the top level`,
          ),
        );
        stack.push({ level, kind: 'skip' });
        continue;
      }
    } else if (parent?.kind === 'leafless') {
      diagnostics.push(diagnostic('E204', loc, `Line ${lineNo}: the line above cannot contain other lines`));
      stack.push({ level, kind: 'skip' });
      continue;
    }

    // An element.
    if (head?.kind !== 'word') {
      diagnostics.push(
        diagnostic(
          'E106',
          loc,
          `Line ${lineNo}: a line starts with a component name, such as button or text`,
        ),
      );
      stack.push({ level, kind: 'skip' });
      continue;
    }
    let type = name;
    if (!own(COMPONENTS, type) || type === 'table-row' || (level > 0 && type === 'screen')) {
      if (type === 'screen') {
        diagnostics.push(diagnostic('E203', loc, `Line ${lineNo}: "screen" must be at the top level`));
      } else {
        const guess = own(SYNONYMS, type.toLowerCase()) ?? closest(type, WRITTEN_NAMES);
        diagnostics.push(
          diagnostic(
            'E201',
            loc,
            `Line ${lineNo}: there is no "${type}".${guess ? ` Did you mean "${guess}"?` : ''}`,
            guess ? `Use "${guess}".` : 'See the list of components in the specification, section 5.',
          ),
        );
      }
      stack.push({ level, kind: 'skip' });
      continue;
    }
    if (type === 'row' && parent?.node?.type === 'table') type = 'table-row';
    let node: Node;
    try {
      node = buildElement(tokens, lineNo, type);
    } catch (e) {
      if (!(e instanceof LineError)) throw e;
      diagnostics.push(diagnostic(e.code, { line: lineNo, column: e.col }, e.message));
      stack.push({ level, kind: 'skip' });
      continue;
    }
    node.loc = loc;
    if (level === 0) {
      tree.screens.push(node);
    } else if (parent?.node) {
      // Children are kept even under components that take none; validation reports E204.
      const p = parent.node;
      insertChild(p, node);
    }
    stack.push({ level, kind: 'node', node });
  }

  if (theme) {
    // Members in schema order: name, extends, tokens, loc.
    const t: ThemeDecl = { name: theme.name };
    if (theme.extends !== undefined) t.extends = theme.extends;
    if (theme.tokens) t.tokens = theme.tokens;
    if (theme.loc) t.loc = theme.loc;
    tree.theme = t;
  }
  if (flows.length > 0) tree.flows = flows;
  // Keep the document's members in schema order.
  const ordered: Document = { type: 'document', version: tree.version, screens: tree.screens };
  if (tree.theme) {
    const { screens, ...rest } = ordered;
    const out: Document = { ...rest, theme: tree.theme, screens };
    if (tree.flows) out.flows = tree.flows;
    return { tree: out, diagnostics, tooLarge: false, tokenLines };
  }
  if (tree.flows) ordered.flows = tree.flows;
  return { tree: ordered, diagnostics, tooLarge: false, tokenLines };
}

/** Adds a child, keeping `children` before `loc` in member order. */
function insertChild(parent: Node, child: Node): void {
  if (parent.children) {
    parent.children.push(child);
    return;
  }
  const loc = parent.loc;
  delete (parent as Partial<Node>).loc;
  parent.children = [child];
  parent.loc = loc;
}

function pushSkip(stack: Frame[], level: number): void {
  while (stack.length > 0 && (stack[stack.length - 1] as Frame).level >= level) stack.pop();
  stack.push({ level, kind: 'skip' });
}

function readHeader(tokens: Token[], line: number, tree: Document, diagnostics: Diagnostic[]): void {
  const v = tokens[1];
  const extra = tokens[2];
  if (v?.kind !== 'word' || !VERSION.test(v.text) || extra) {
    const col = (extra ?? v ?? tokens[0])?.col ?? 1;
    diagnostics.push(
      diagnostic(
        'E106',
        { line, column: col },
        `Line ${line}: write the version as "wirelith ${SPEC_VERSION}"`,
      ),
    );
    return;
  }
  const [major, minor] = v.text.split('.').map(Number) as [number, number];
  tree.version = v.text;
  const [ourMajor, ourMinor] = SPEC_VERSION.split('.').map(Number) as [number, number];
  if (major > ourMajor) {
    diagnostics.push(
      diagnostic(
        'E103',
        { line, column: v.col },
        `This source targets Wirelith ${v.text}; this renderer supports ${SPEC_VERSION}`,
      ),
    );
  } else if (major === ourMajor && minor > ourMinor) {
    diagnostics.push(
      diagnostic(
        'W101',
        { line, column: v.col },
        `This source targets ${v.text}; rendering as ${SPEC_VERSION}`,
      ),
    );
  }
}

function readTheme(tokens: Token[], line: number): { theme: ThemeDecl; block: boolean } {
  const nameTok = tokens[1];
  const loc = { line, column: tokens[0]?.col ?? 1 };
  if (nameTok?.kind === 'word' && tokens.length === 2) {
    return { theme: { name: nameTok.text, loc }, block: false };
  }
  if (nameTok?.kind === 'string') {
    const theme: ThemeDecl = { name: nameTok.text, tokens: {} };
    for (const t of tokens.slice(2)) {
      if (
        t.kind === 'attr' &&
        t.key === 'extends' &&
        typeof t.value === 'string' &&
        theme.extends === undefined
      ) {
        theme.extends = t.value;
      } else {
        throw new LineError(
          'E106',
          t.col,
          `Line ${line}, column ${t.col}: a theme block takes only a name and extends=`,
        );
      }
    }
    theme.loc = loc;
    return { theme, block: true };
  }
  const col = nameTok?.col ?? loc.column;
  throw new LineError(
    'E106',
    col,
    `Line ${line}: write "theme paper", or "theme "name" extends=paper" with token lines below`,
  );
}

function readFlow(tokens: Token[], line: number): Flow {
  const [, from, arrow, to, label, extra] = tokens;
  const loc = { line, column: tokens[0]?.col ?? 1 };
  if (
    from?.kind !== 'id' ||
    arrow?.kind !== 'arrow' ||
    to?.kind !== 'id' ||
    (label && label.kind !== 'string') ||
    extra
  ) {
    const col = (extra ?? label ?? to ?? arrow ?? from ?? tokens[0])?.col ?? 1;
    throw new LineError('E106', col, `Line ${line}: write a flow as flow #from -> #to "optional label"`);
  }
  if (label?.kind === 'string') {
    return { from: from.text, to: to.text, label: label.text, loc };
  }
  return { from: from.text, to: to.text, loc };
}
