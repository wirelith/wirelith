// SPDX-License-Identifier: MIT

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const PREPUSH = resolve('scripts/hygiene/prepush.mjs');
const ME = 'Sam Example <1+sam@users.noreply.github.com>';
const GITHUB = 'GitHub <noreply@github.com>';
const OUTSIDER = 'Outsider <outsider@example.com>';

/** @type {string[]} */
const made = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A throwaway repository with its own config, so no global git settings or hooks apply. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'wl-prepush-'));
  made.push(dir);
  /** @type {Record<string, string | undefined>} */
  const env = {
    ...process.env,
    HOME: dir,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(dir, 'no-config'),
  };
  delete env.WIRELITH_DENYLIST_FILE;
  delete env.WIRELITH_DENYLIST;
  const git = (/** @type {string[]} */ args, /** @type {Record<string, string>} */ extra = {}) =>
    execFileSync('git', args, { cwd: dir, env: { ...env, ...extra }, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']);
  /** Commits a file change as `who` (author and committer), signed off by `who` unless told not to. */
  const commit = (/** @type {string} */ file, /** @type {string} */ who, signoff = true) => {
    const [, name = '', email = ''] = who.match(/^(.*) <(.*)>$/) ?? [];
    writeFileSync(join(dir, file), `${file} ${Math.random()}\n`);
    git(['add', file]);
    const msg = `Change ${file}${signoff ? `\n\nSigned-off-by: ${who}` : ''}`;
    git(['commit', '-q', '-m', msg], {
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
    });
    return git(['rev-parse', 'HEAD']);
  };
  /** Marks a commit as published on the remote's branch. */
  const publish = (/** @type {string} */ name, /** @type {string} */ sha) =>
    git(['update-ref', `refs/remotes/origin/${name}`, sha]);
  /** Runs the hook for a push of `local` to `branch`, whose remote tip is `remote`. */
  const push = (/** @type {string} */ branch, /** @type {string} */ local, /** @type {string} */ remote) =>
    spawnSync(process.execPath, [PREPUSH], {
      cwd: dir,
      env,
      encoding: 'utf8',
      input: `refs/heads/${branch} ${local} refs/heads/${branch} ${remote}\n`,
    });
  writeFileSync(join(dir, 'LICENSE'), 'MIT License\n\nCopyright 2026 Fernway Labs\n');
  return { git, commit, publish, push };
}

const ZERO = '0'.repeat(40);

// Each test makes a throwaway repository and runs git many times, which is slow on Windows.
describe('pre-push hook', { timeout: 30_000 }, () => {
  it('ignores commits already published on main after a rebase', () => {
    const r = repo();
    const a = r.commit('README.md', ME);
    r.git(['switch', '-q', '-c', 'topic']);
    const old = r.commit('topic.txt', ME);
    r.publish('topic', old);
    r.git(['switch', '-q', 'main']);
    // A squash merge on main, committed under GitHub's own address and with no sign-off.
    const squash = r.commit('other.txt', GITHUB, false);
    r.publish('main', squash);
    r.git(['switch', '-q', 'topic']);
    r.git(['rebase', '-q', 'main'], {
      GIT_COMMITTER_NAME: 'Sam Example',
      GIT_COMMITTER_EMAIL: '1+sam@users.noreply.github.com',
    });
    const rebased = r.git(['rev-parse', 'HEAD']);
    const out = r.push('topic', rebased, old);
    expect(out.stderr).not.toContain(squash.slice(0, 12));
    expect(out.status, out.stdout + out.stderr).toBe(0);
    expect(a).not.toBe('');
  });

  it('ignores commits already published on main when main is merged into a branch', () => {
    const r = repo();
    r.commit('README.md', ME);
    r.git(['switch', '-q', '-c', 'topic']);
    const old = r.commit('topic.txt', ME);
    r.publish('topic', old);
    r.git(['switch', '-q', 'main']);
    const squash = r.commit('other.txt', GITHUB, false);
    r.publish('main', squash);
    r.git(['switch', '-q', 'topic']);
    r.git(
      [
        'merge',
        '-q',
        '--no-edit',
        '-m',
        'Merge main\n\nSigned-off-by: Sam Example <1+sam@users.noreply.github.com>',
        'main',
      ],
      {
        GIT_AUTHOR_NAME: 'Sam Example',
        GIT_AUTHOR_EMAIL: '1+sam@users.noreply.github.com',
        GIT_COMMITTER_NAME: 'Sam Example',
        GIT_COMMITTER_EMAIL: '1+sam@users.noreply.github.com',
      },
    );
    const out = r.push('topic', r.git(['rev-parse', 'HEAD']), old);
    expect(out.status, out.stdout + out.stderr).toBe(0);
  });

  it('still blocks a new commit by a non-noreply address', () => {
    const r = repo();
    r.commit('README.md', ME);
    const base = r.git(['rev-parse', 'HEAD']);
    r.publish('main', base);
    r.git(['switch', '-q', '-c', 'topic']);
    const bad = r.commit('topic.txt', OUTSIDER);
    const out = r.push('topic', bad, ZERO);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain(bad.slice(0, 12));
    expect(out.stderr).toContain('not a GitHub noreply address');
  });

  it('checks every commit of a new branch that main does not have', () => {
    const r = repo();
    r.commit('README.md', ME);
    r.publish('main', r.git(['rev-parse', 'HEAD']));
    r.git(['switch', '-q', '-c', 'topic']);
    r.commit('one.txt', ME);
    const unsigned = r.commit('two.txt', ME, false);
    const out = r.push('topic', unsigned, ZERO);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain(unsigned.slice(0, 12));
    expect(out.stderr).toContain('Signed-off-by');
  });

  it('says so when a push publishes nothing new', () => {
    const r = repo();
    const a = r.commit('README.md', ME);
    r.publish('main', a);
    const out = r.push('main', a, a);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('nothing new to check');
  });
});
