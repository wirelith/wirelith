// SPDX-License-Identifier: MIT

// Matching rules for the private denylist.
//
// - One term per line. Empty lines and lines that start with # are ignored.
// - Matching ignores letter case.
// - A term matches only as a whole word or phrase: the character before and the character after
//   a match must not be a letter, a digit or a combining mark.
// - A run of whitespace inside a term matches any run of whitespace in the text, including a
//   line break.
// - Terms are literal text. Punctuation in a term is matched as itself, never as a pattern.
//
// Nothing in this module ever returns or prints a term or the text it matched. Callers get
// positions only.

const SYNTAX_CHARS = /[\^$\\.*+?()[\]{}|/]/g;
const WORD_CHAR = '[\\p{L}\\p{N}\\p{M}]';

/**
 * Parses the denylist file format into a list of terms.
 * @param {string} text
 * @returns {string[]}
 */
export function parseTerms(text) {
  const terms = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    terms.push(line);
  }
  return terms;
}

/**
 * Compiles one term into a regular expression that matches it literally, by the rules above.
 * @param {string} term
 * @returns {RegExp}
 */
export function compileTerm(term) {
  const words = term.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) throw new Error('empty term');
  const body = words.map((w) => w.replace(SYNTAX_CHARS, '\\$&')).join('\\s+');
  return new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, 'giu');
}

/**
 * A compiled denylist.
 */
export class Denylist {
  /** @param {string[]} terms */
  constructor(terms) {
    /** @type {RegExp[]} */
    this.patterns = terms.map(compileTerm);
  }

  /** @param {string} fileText */
  static fromText(fileText) {
    return new Denylist(parseTerms(fileText));
  }

  get size() {
    return this.patterns.length;
  }

  /**
   * Returns the sorted, de-duplicated 1-based line numbers where any term starts.
   * @param {string} text
   * @returns {number[]}
   */
  lines(text) {
    const starts = lineStarts(text);
    const found = new Set();
    for (const re of this.patterns) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        found.add(lineOf(starts, m.index ?? 0));
      }
    }
    return [...found].sort((a, b) => a - b);
  }

  /**
   * True when any term occurs in the text.
   * @param {string} text
   */
  matches(text) {
    return this.lines(text).length > 0;
  }
}

/**
 * @param {string} text
 * @returns {number[]}
 */
export function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/**
 * @param {number[]} starts
 * @param {number} index
 */
export function lineOf(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Loads the denylist from the environment: the WIRELITH_DENYLIST variable holds the list itself
 * (used in CI, from a secret), and WIRELITH_DENYLIST_FILE names a file that holds it (used
 * locally). Returns null when neither is set.
 * @param {(path: string) => string} readFile
 * @param {Record<string, string | undefined>} env
 * @returns {Denylist | null}
 */
export function loadDenylist(readFile, env) {
  const inline = env.WIRELITH_DENYLIST;
  if (inline && inline.trim() !== '') return Denylist.fromText(inline);
  const file = env.WIRELITH_DENYLIST_FILE;
  if (file && file.trim() !== '') return Denylist.fromText(readFile(file));
  return null;
}
