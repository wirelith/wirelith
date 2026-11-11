// SPDX-License-Identifier: MIT

// Unit tests for the holder, commit, diff, event and PR checklist rules. All names, emails and
// terms are made up.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commitProblems, isNoreply, signOffEmails } from '../lib/commits.mjs';
import { addedLines } from '../lib/diff.mjs';
import { eventTexts } from '../lib/events.mjs';
import { holderLines, holderWord, isAllowedPath } from '../lib/holder.mjs';
import { REQUIRED_CHECKBOXES, untickedCheckboxes } from '../lib/pr-template.mjs';

describe('holder', () => {
  it('reads the first word of the holder from LICENSE', () => {
    expect(holderWord('MIT License\n\nCopyright 2026 Quillmoor Widgets LLC\n')).toBe('Quillmoor');
    expect(holderWord('Copyright (c) 2025-2026 Fenwick Labs\n')).toBe('Fenwick');
  });

  it('fails when LICENSE has no copyright line', () => {
    expect(() => holderWord('MIT License')).toThrow();
  });

  it('finds the word in any letter case, even inside longer words', () => {
    expect(holderLines('Quillmoor', 'a\nQUILLMOOR\nquillmoorish\nnone')).toEqual([2, 3]);
  });

  it('allows only LICENSE and NOTICE at the root', () => {
    expect(isAllowedPath('LICENSE')).toBe(true);
    expect(isAllowedPath('NOTICE')).toBe(true);
    expect(isAllowedPath('docs/LICENSE')).toBe(false);
    expect(isAllowedPath('README.md')).toBe(false);
  });

  it('this repository has a copyright line the check can read', () => {
    expect(holderWord(readFileSync('LICENSE', 'utf8')).length).toBeGreaterThan(0);
  });
});

describe('commits', () => {
  const ok = {
    sha: 'a'.repeat(40),
    message: 'Add a thing\n\nSigned-off-by: Ada Fenwick <123+adafen@users.noreply.github.com>\n',
    authorEmail: '123+adafen@users.noreply.github.com',
    committerEmail: '123+adafen@users.noreply.github.com',
  };

  it('accepts both noreply address forms', () => {
    expect(isNoreply('123+adafen@users.noreply.github.com')).toBe(true);
    expect(isNoreply('adafen@users.noreply.github.com')).toBe(true);
    expect(isNoreply('ada@example.com')).toBe(false);
    expect(isNoreply('ada@users.noreply.github.com.example.com')).toBe(false);
    expect(isNoreply('noreply@github.com')).toBe(false);
  });

  it('passes a noreply, signed-off commit', () => {
    expect(commitProblems(ok)).toEqual([]);
  });

  it('fails a commit with a real author email', () => {
    expect(commitProblems({ ...ok, authorEmail: 'ada@example.com' })).toContain(
      'the author email is not a GitHub noreply address',
    );
  });

  it('fails a commit with a real committer email', () => {
    expect(commitProblems({ ...ok, committerEmail: 'ada@example.com' })).toContain(
      'the committer email is not a GitHub noreply address',
    );
  });

  it("accepts GitHub's own committer address only on commits GitHub signed", () => {
    const web = { ...ok, committerEmail: 'noreply@github.com' };
    expect(commitProblems({ ...web, signedByGitHub: true })).toEqual([]);
    expect(commitProblems(web)).toContain('the committer email is not a GitHub noreply address');
  });

  it('fails a commit without a sign-off', () => {
    expect(commitProblems({ ...ok, message: 'Add a thing\n' })).toEqual([
      'there is no Signed-off-by line (use git commit -s)',
    ]);
  });

  it("fails a sign-off that isn't the author's", () => {
    const message = 'Add\n\nSigned-off-by: Bo Quell <9+boq@users.noreply.github.com>\n';
    expect(commitProblems({ ...ok, message })).toEqual(['no Signed-off-by line matches the author email']);
  });

  it('reads sign-off emails', () => {
    expect(signOffEmails('x\n\nSigned-off-by: A B <a@b.c>\nSigned-off-by: C <d@e.f>')).toEqual([
      'a@b.c',
      'd@e.f',
    ]);
  });
});

describe('diff', () => {
  it('numbers added lines as they are in the new file', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' keep',
      '-gone',
      '+new two',
      '+new three',
      ' keep four',
      '@@ -10,2 +11,2 @@',
      ' eleven',
      '+twelve',
      '\\ No newline at end of file',
    ].join('\n');
    expect(addedLines(patch)).toEqual([
      { line: 2, text: 'new two' },
      { line: 3, text: 'new three' },
      { line: 12, text: 'twelve' },
    ]);
  });
});

describe('events', () => {
  it('reads an issue title and body', () => {
    const t = eventTexts({ issue: { html_url: 'u', title: 'T', body: 'B' } });
    expect(t).toEqual({
      kind: 'issue',
      url: 'u',
      fields: [
        { name: 'title', text: 'T' },
        { name: 'body', text: 'B' },
      ],
    });
  });

  it('reads a comment body, on an issue or a discussion', () => {
    expect(eventTexts({ issue: {}, comment: { html_url: 'c', body: 'x' } })?.fields).toEqual([
      { name: 'comment', text: 'x' },
    ]);
    expect(eventTexts({ discussion: {}, comment: { html_url: 'c', body: 'y' } })?.kind).toBe('comment');
  });

  it('treats a missing body as empty', () => {
    expect(eventTexts({ discussion: { title: 'T', body: null } })?.fields[1]).toEqual({
      name: 'body',
      text: '',
    });
  });
});

describe('PR checklist', () => {
  const template = readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8');
  const ticked = template.replace(/- \[ \]/g, '- [x]');

  it('the template contains every required item, unticked', () => {
    expect(untickedCheckboxes(template)).toEqual(REQUIRED_CHECKBOXES);
  });

  it('passes when every item is ticked, with x or X', () => {
    expect(untickedCheckboxes(ticked)).toEqual([]);
    expect(untickedCheckboxes(template.replace(/- \[ \]/g, '- [X]'))).toEqual([]);
  });

  it('fails when one item is unticked', () => {
    const lines = ticked.split('\n');
    const i = lines.findIndex((l) => l.includes(REQUIRED_CHECKBOXES[2] ?? '?'));
    lines[i] = (lines[i] ?? '').replace('[x]', '[ ]');
    expect(untickedCheckboxes(lines.join('\n'))).toEqual([REQUIRED_CHECKBOXES[2]]);
  });

  it('fails when an item was deleted, or the description is empty', () => {
    const without = ticked
      .split('\n')
      .filter((l) => !l.includes(REQUIRED_CHECKBOXES[0] ?? '?'))
      .join('\n');
    expect(untickedCheckboxes(without)).toEqual([REQUIRED_CHECKBOXES[0]]);
    expect(untickedCheckboxes(null)).toEqual(REQUIRED_CHECKBOXES);
  });

  it('does not accept the phrase outside a ticked checkbox', () => {
    expect(untickedCheckboxes(`[x] ${REQUIRED_CHECKBOXES.join(' ')}`)).toHaveLength(5);
  });
});
