// SPDX-License-Identifier: MIT

// The SVG normalisation the conformance suite applies before comparing outputs byte for byte.
// It is documented in conformance/NORMALISATION.md. It only removes differences that don't
// change the document: it never reorders attributes, rewrites numbers or changes text.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** Elements whose text content is kept exactly, whitespace included. */
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc', 'wl:source', 'a']);

/** @param {string} s */
function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, e) => {
    if (e.startsWith('#x')) return String.fromCodePoint(Number.parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(Number.parseInt(e.slice(1), 10));
    return Object.hasOwn(ENTITIES, e) ? ENTITIES[/** @type {keyof typeof ENTITIES} */ (e)] : whole;
  });
}

/** @param {string} s */
const encText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** @param {string} s */
const encAttr = (s) => encText(s).replace(/"/g, '&quot;');

/**
 * Normalises an SVG document:
 *  1. drops a byte-order mark, an XML declaration, a doctype and comments;
 *  2. turns CRLF and CR into LF;
 *  3. removes whitespace-only text between tags, except inside text-bearing elements;
 *  4. writes every attribute value in double quotes, and every empty element as <x/>;
 *  5. writes character data with the minimal escapes (&amp; &lt; &gt;, and &quot; in attributes);
 *  6. drops whitespace inside tags and at the end of the document.
 * @param {string} svg
 * @returns {string}
 */
export function normaliseSvg(svg) {
  let s = svg.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  s = s
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  /** @type {{ text: string, open?: string, empty?: boolean }[]} */
  const out = [];
  /** @type {string[]} */
  const stack = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '<') {
      const end = s.indexOf('>', i);
      if (end < 0) throw new Error('unterminated tag');
      const inner = s.slice(i + 1, end);
      i = end + 1;
      if (inner.startsWith('/')) {
        const name = inner.slice(1).trim();
        /** @type {{ text: string, open?: string, empty?: boolean } | undefined} */
        const last = out[out.length - 1];
        // <x></x> becomes <x/>.
        if (last && last.open === name && last.empty) {
          out[out.length - 1] = { text: `${last.text.slice(0, -1)}/>` };
        } else {
          out.push({ text: `</${name}>` });
        }
        stack.pop();
        continue;
      }
      const selfClosing = inner.trimEnd().endsWith('/');
      const body = selfClosing ? inner.trimEnd().slice(0, -1) : inner;
      const m = /^\s*([^\s/>]+)([\s\S]*)$/.exec(body);
      if (!m) throw new Error(`malformed tag <${inner}>`);
      const name = m[1] ?? '';
      const attrs = [];
      for (const a of (m[2] ?? '').matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        attrs.push(` ${a[1]}="${encAttr(decode(a[3] ?? a[4] ?? ''))}"`);
      }
      const tag = `<${name}${attrs.join('')}${selfClosing ? '/' : ''}>`;
      if (selfClosing) {
        out.push({ text: tag });
      } else {
        out.push({ text: tag, open: name, empty: true });
        stack.push(name);
      }
    } else {
      const next = s.indexOf('<', i);
      const raw = s.slice(i, next < 0 ? s.length : next);
      i = next < 0 ? s.length : next;
      const parent = stack[stack.length - 1];
      if (raw.trim() === '' && !TEXT_ELEMENTS.has(parent ?? '')) continue;
      if (raw === '') continue;
      /** @type {{ text: string, open?: string, empty?: boolean } | undefined} */
      const prev = out[out.length - 1];
      if (prev) prev.empty = false;
      out.push({ text: encText(decode(raw)) });
    }
  }
  return out
    .map((p) => p.text)
    .join('')
    .trimEnd();
}
