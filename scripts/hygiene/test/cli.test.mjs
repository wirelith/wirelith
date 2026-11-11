// SPDX-License-Identifier: MIT

// End-to-end tests of the check commands, run in a throwaway git repository. They prove that a
// finding is reported by path and line, and that the term never appears in the output.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPTS = resolve('scripts/hygiene');
const TERM = 'Plovermoss Quarterly'; // made up
const HOLDER = 'Quillmoor'; // made up

/** @type {string} */
let dir;

/**
 * @param {string} script
 * @param {string[]} args
 * @param {Record<string, string>} [env]
 */
function run(script, args, env = {}) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** @param {string[]} args */
function git(...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wl-hygiene-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', '1+tester@users.noreply.github.com');
  git('config', 'user.name', 'Tester');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'LICENSE'), `MIT License\n\nCopyright 2026 ${HOLDER} Widgets LLC\n`);
  writeFileSync(join(dir, 'NOTICE'), `${HOLDER} Widgets LLC\n`);
  writeFileSync(join(dir, 'README.md'), '# Example\n');
  git('add', '.');
  git('commit', '-q', '-s', '-m', 'Start');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('denylist command', () => {
  it('reports path and line, never the term', () => {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs/a.md'), `one\ntwo\nthe ${TERM.toUpperCase()}\n`);
    const r = run('denylist.mjs', ['--tree'], { WIRELITH_DENYLIST: `# test list\n${TERM}\n` });
    expect(r.status).toBe(1);
    expect(r.out).toContain('docs/a.md:3');
    expect(r.out.toLowerCase()).not.toContain('plovermoss');
    expect(r.out.toLowerCase()).not.toContain('quarterly');
  });

  it('checks file names', () => {
    writeFileSync(join(dir, 'plovermoss-notes.txt'), 'x\n');
    const r = run('denylist.mjs', ['--tree'], { WIRELITH_DENYLIST: 'plovermoss' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('(file name)');
    expect(r.out.toLowerCase().replace('plovermoss-notes.txt', '')).not.toContain('plovermoss');
  });

  it('checks commit messages and the branch name in a range', () => {
    git('checkout', '-q', '-b', 'plovermoss-fix');
    writeFileSync(join(dir, 'b.txt'), 'fine\n');
    git('add', '.');
    git('commit', '-q', '-s', '-m', 'Mention Plovermoss');
    const r = run('denylist.mjs', ['--range', 'main', 'HEAD', 'plovermoss-fix'], {
      WIRELITH_DENYLIST: 'plovermoss',
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('branch name:1');
    expect(r.out).toMatch(/commit [0-9a-f]{12} message:1/);
    expect(r.out.replace(/commit [0-9a-f]{12}/, '').toLowerCase()).not.toContain('plovermoss');
  });

  it('passes clean text', () => {
    const r = run('denylist.mjs', ['--tree'], { WIRELITH_DENYLIST: TERM });
    expect(r.status).toBe(0);
  });

  it('skips with a notice when no list is set locally', () => {
    const r = run('denylist.mjs', ['--tree']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('skipped');
  });

  it('fails in CI mode when no list is set', () => {
    const r = run('denylist.mjs', ['--github-pr']);
    expect(r.status).toBe(2);
  });
});

describe('holder command', () => {
  it('allows the name in LICENSE and NOTICE only', () => {
    expect(run('check-holder.mjs', ['--tree']).status).toBe(0);
    writeFileSync(join(dir, 'README.md'), `# Example\n\nby quillmoor\n`);
    const r = run('check-holder.mjs', ['--tree']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('README.md:3');
  });

  it('checks file names, commit messages and the branch name', () => {
    git('checkout', '-q', '-b', 'quillmoor-work');
    writeFileSync(join(dir, 'QuillmoorNotes.md'), 'x\n');
    git('add', '.');
    git('commit', '-q', '-s', '-m', 'For QUILLMOOR');
    const r = run('check-holder.mjs', ['--range', 'main', 'HEAD', 'quillmoor-work']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('QuillmoorNotes.md (file name)');
    expect(r.out).toContain('branch name:1');
    expect(r.out).toMatch(/commit [0-9a-f]{12} message:1/);
  });
});

describe('commits command', () => {
  it('fails a commit by a non-noreply author, and one without sign-off', () => {
    git('checkout', '-q', '-b', 'work');
    writeFileSync(join(dir, 'c.txt'), '1\n');
    git('add', '.');
    git('-c', 'user.email=ada@example.com', 'commit', '-q', '-s', '-m', 'Real email');
    writeFileSync(join(dir, 'c.txt'), '2\n');
    git('commit', '-q', '-am', 'No sign-off');
    const r = run('check-commits.mjs', ['--range', 'main', 'HEAD']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('author email is not a GitHub noreply address');
    expect(r.out).toContain('no Signed-off-by line');
  });

  it('passes noreply, signed-off commits', () => {
    git('checkout', '-q', '-b', 'work');
    writeFileSync(join(dir, 'c.txt'), '1\n');
    git('add', '.');
    git('commit', '-q', '-s', '-m', 'Good');
    expect(run('check-commits.mjs', ['--range', 'main', 'HEAD']).status).toBe(0);
  });
});
