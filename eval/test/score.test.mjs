// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blocks, score } from '../score.mjs';

const reference = (/** @type {'a' | 'b'} */ s) =>
  readFileSync(`eval/test/fixtures/reference-${s}.md`, 'utf8');

describe('score', () => {
  it('gives the reference answers full marks', () => {
    for (const s of /** @type {const} */ (['a', 'b'])) {
      const r = score(reference(s), s);
      expect(r.valid, s).toBe(5);
      expect(r.requirementsMet, s).toBe(r.requirements);
      expect(r.warnings, s).toBe(0);
    }
  });

  it('marks an invalid block as invalid and meeting nothing', () => {
    const broken = reference('a').replace(
      'input "Name"\n  input "Email" type=email placeholder',
      'textfield "Name"\n  input "Email" type=email placeholder',
    );
    const r = score(broken, 'a');
    expect(r.valid).toBe(4);
    expect(r.tasks[0]?.valid).toBe(false);
    expect(r.tasks[0]?.codes).toContain('E201');
    expect(r.tasks[0]?.met).toEqual([]);
  });

  it('reports which requirements a valid block misses', () => {
    const noCheckbox = reference('a').replace('  checkbox "I accept the terms"\n', '');
    const t = score(noCheckbox, 'a').tasks[0];
    expect(t?.valid).toBe(true);
    expect(t?.missed).toEqual(['a checkbox']);
  });

  it('scores missing blocks as zero', () => {
    const r = score(
      blocks(reference('b'))
        .slice(0, 2)
        .map((b) => `\`\`\`wirelith\n${b}\`\`\``)
        .join('\n\n'),
      'b',
    );
    expect(r.blocks).toBe(2);
    expect(r.valid).toBe(2);
    expect(r.tasks[4]?.present).toBe(false);
  });

  it('reads tilde fences and ignores other code blocks', () => {
    expect(blocks('~~~wirelith\nscreen "A"\n~~~\n```js\nx\n```\n```wirelith\nscreen "B"\n```')).toEqual([
      'screen "A"\n',
      'screen "B"\n',
    ]);
  });

  it('needs a priority choice separate from the assignee dropdown', () => {
    const noPriority = reference('a').replace(
      '    radio "Priority" [Low, Medium, High] value="Medium"\n',
      '',
    );
    expect(score(noPriority, 'a').tasks[4]?.missed).toEqual([
      'the dialog has fields, a dropdown and a priority choice',
    ]);
    const twoSelects = reference('a').replace(
      'radio "Priority" [Low, Medium, High] value="Medium"',
      'select "Priority" [Low, Medium, High]',
    );
    expect(score(twoSelects, 'a').tasks[4]?.missed).toEqual([]);
  });

  it('counts an h3 as a heading, and a retry button nested in a row', () => {
    const h3 = reference('b').replace('  h1 "Pricing" align=center', '  h3 "Pricing"');
    expect(score(h3, 'b').tasks[1]?.missed).toEqual([]);
    const nested = reference('b').replace(
      '    button "Try again" primary',
      '    row\n      button "Try again" primary',
    );
    expect(score(nested, 'b').tasks[4]?.valid).toBe(true);
    expect(score(nested, 'b').tasks[4]?.missed).toEqual([]);
  });
});
