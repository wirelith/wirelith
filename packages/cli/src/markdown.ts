// SPDX-License-Identifier: MIT

// Finds the `wirelith` fenced code blocks in a markdown document, following CommonMark's rules
// for fences: three or more backticks or tildes, indented by up to three spaces, closed by a
// fence of the same character at least as long. An unclosed fence runs to the end.

export interface Fence {
  /** The source inside the fence. */
  source: string;
  /** The markdown line (from 1) of the source's first line. */
  firstLine: number;
  /** How many spaces the fence is indented by; removed from each line of the source. */
  indent: number;
  /** Index of the opening fence line, and of the closing one (or the line count). */
  open: number;
  close: number;
}

const OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;

export function findFences(markdown: string): Fence[] {
  const lines = markdown.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const out: Fence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = OPEN.exec(lines[i] ?? '');
    if (!m) continue;
    const indent = (m[1] ?? '').length;
    const marker = m[2] ?? '';
    const info = (m[3] ?? '').trim();
    if (marker.startsWith('`') && info.includes('`')) continue;
    const lang = info.split(/\s+/)[0] ?? '';
    const char = marker[0] ?? '`';
    // Find the closing fence.
    let close = lines.length;
    for (let k = i + 1; k < lines.length; k++) {
      const c = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[k] ?? '');
      if (c && (c[1] ?? '')[0] === char && (c[1] ?? '').length >= marker.length) {
        close = k;
        break;
      }
    }
    if (lang === 'wirelith') {
      const body = lines.slice(i + 1, close).map((l) => {
        let n = 0;
        while (n < indent && l[n] === ' ') n++;
        return l.slice(n);
      });
      out.push({
        source: body.length > 0 ? `${body.join('\n')}\n` : '',
        firstLine: i + 2,
        indent,
        open: i,
        close,
      });
    }
    i = close;
  }
  return out;
}

/** Replaces the source of each fence (in order) and returns the new markdown, with LF endings. */
export function replaceFences(markdown: string, sources: string[]): string {
  const fences = findFences(markdown);
  const lines = markdown.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  for (let f = fences.length - 1; f >= 0; f--) {
    const fence = fences[f] as Fence;
    const text = sources[f] ?? fence.source;
    const body =
      text === ''
        ? []
        : text
            .replace(/\n$/, '')
            .split('\n')
            .map((l) => (l === '' ? '' : ' '.repeat(fence.indent) + l));
    lines.splice(fence.open + 1, fence.close - fence.open - 1, ...body);
  }
  return lines.join('\n');
}
