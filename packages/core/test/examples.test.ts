// SPDX-License-Identifier: MIT

// The specification's worked examples and the one-page AI spec's example must validate with no
// errors and no warnings.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/** The wirelith fences in a markdown file, with the heading above each. */
function fences(path: string): { title: string; source: string }[] {
  const out: { title: string; source: string }[] = [];
  let title = '';
  const lines = readFileSync(path, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (l.startsWith('#')) title = l.replace(/^#+ /, '');
    if (l === '```wirelith') {
      const body: string[] = [];
      for (i++; i < lines.length && lines[i] !== '```'; i++) body.push(lines[i] ?? '');
      out.push({ title, source: `${body.join('\n')}\n` });
    }
  }
  return out;
}

const worked = fences('spec/spec.md').filter((f) => /^18\.\d/.test(f.title));
const aiSpec = fences('spec/ai-spec.md');

describe('worked examples', () => {
  it('finds all seven worked examples and the AI spec example', () => {
    expect(worked).toHaveLength(7);
    expect(aiSpec).toHaveLength(1);
  });

  for (const { title, source } of [
    ...worked,
    ...aiSpec.map((f) => ({ ...f, title: `AI spec: ${f.title}` })),
  ]) {
    it(`${title} validates with no errors or warnings`, () => {
      // The full pipeline, including layout warnings such as W601 and W602.
      expect(validate(source)).toEqual([]);
    });
  }
});
