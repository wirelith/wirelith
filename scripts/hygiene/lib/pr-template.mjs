// SPDX-License-Identifier: MIT

// The checklist every pull request must tick. Each entry is matched by a key phrase taken from
// its text in .github/PULL_REQUEST_TEMPLATE.md, so small wording changes there don't break it.

export const REQUIRED_CHECKBOXES = [
  'contains no private or internal information',
  'use made-up products and people only',
  'GitHub noreply email and are signed off',
  'If this changes the language',
  'adds nothing specific to any one host application',
];

/**
 * Returns the key phrases of required checkboxes that are missing or not ticked.
 * @param {string | null | undefined} body
 * @returns {string[]}
 */
export function untickedCheckboxes(body) {
  const lines = (body ?? '').split(/\r?\n/);
  const missing = [];
  for (const phrase of REQUIRED_CHECKBOXES) {
    const ticked = lines.some(
      (line) => /^\s*[-*] \[[xX]\] /.test(line) && line.toLowerCase().includes(phrase.toLowerCase()),
    );
    if (!ticked) missing.push(phrase);
  }
  return missing;
}
