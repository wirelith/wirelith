// SPDX-License-Identifier: MIT

// The guidance for agents stays in step with the repository.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('agent guidance', () => {
  it('llms.txt links only to files that exist in this repository', () => {
    const text = readFileSync('llms.txt', 'utf8');
    const links = [
      ...text.matchAll(/\]\(https:\/\/github\.com\/wirelith\/wirelith\/blob\/main\/([^)]+)\)/g),
    ].map((m) => m[1] ?? '');
    expect(links.length).toBeGreaterThan(5);
    for (const path of links) expect(existsSync(path), path).toBe(true);
    expect(text).not.toMatch(/\]\((?!https:\/\/github\.com\/wirelith\/wirelith\/)/);
  });

  it('the skill mentions only diagnostic codes the specification defines', () => {
    const spec = readFileSync('spec/spec.md', 'utf8');
    const skill = readFileSync('skills/wirelith/SKILL.md', 'utf8');
    const codes = [...new Set(skill.match(/\b[EW]\d{3}\b/g) ?? [])];
    expect(codes.length).toBeGreaterThan(10);
    for (const c of codes) expect(spec, c).toContain(`| \`${c}\` |`);
  });
});
