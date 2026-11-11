// SPDX-License-Identifier: MIT

// The copyright-holder check. The holder's name may appear only in LICENSE and NOTICE.
//
// The word to look for is read from the copyright line in LICENSE, so that this check never
// has to spell it out itself. It is the first word of the holder's name, and it is matched in
// any letter case, anywhere, including inside longer words.

/** Paths, relative to the repository root, where the holder's name is expected. */
export const ALLOWED_PATHS = new Set(['LICENSE', 'NOTICE']);

/**
 * Reads the first word of the copyright holder's name from the text of LICENSE.
 * @param {string} licenseText
 * @returns {string}
 */
export function holderWord(licenseText) {
  const m = /^Copyright (?:\(c\) )?\d{4}(?:[-–]\d{4})? (\S+)/mu.exec(licenseText);
  if (!m?.[1]) throw new Error('LICENSE has no "Copyright <year> <holder>" line');
  return m[1];
}

/**
 * Returns the 1-based line numbers of the text where the word appears, in any letter case.
 * @param {string} word
 * @param {string} text
 * @returns {number[]}
 */
export function holderLines(word, text) {
  const needle = word.toLowerCase();
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').toLowerCase().includes(needle)) out.push(i + 1);
  }
  return out;
}

/**
 * True when the holder's name may appear in this repository path.
 * @param {string} path
 */
export function isAllowedPath(path) {
  return ALLOWED_PATHS.has(path);
}
