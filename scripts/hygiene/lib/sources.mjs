// SPDX-License-Identifier: MIT

// Collects the texts a check must read, from the working tree, from a range of local commits,
// or from a pull request on GitHub.
//
// Each text is a "document": a label that says where it came from, its text, and optionally a
// function that maps a line of the text back to a line of the original file. A document whose
// path is set is a file in the repository.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { addedLines, joinAdded } from './diff.mjs';
import { encodePath, ghGet, ghList } from './github.mjs';

/**
 * @typedef {object} Doc
 * @property {string} label where the text came from, for example "README.md" or "PR title"
 * @property {string} text
 * @property {string} [path] the repository path, when the document is a file or a file name
 * @property {boolean} [isName] true when the text is a file name rather than file contents
 * @property {(n: number) => number} [lineAt] maps a line of `text` to a line of the file
 */

/** @param {Buffer} buf */
export function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** @param {string[]} args */
function gitBuffer(args) {
  return execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024 });
}

/**
 * @param {string} path
 * @param {Buffer} content
 * @returns {Doc[]}
 */
function fileDocs(path, content) {
  /** @type {Doc[]} */
  const docs = [{ label: path, text: path, path, isName: true }];
  if (!isBinary(content)) docs.push({ label: path, text: content.toString('utf8'), path });
  return docs;
}

/**
 * Every file in the working tree that git tracks or would track.
 * @returns {Doc[]}
 */
export function treeDocs() {
  const paths = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0')
    .filter(Boolean);
  /** @type {Doc[]} */
  const docs = [];
  for (const path of [...new Set(paths)].sort()) {
    let content;
    try {
      content = readFileSync(path);
    } catch {
      continue; // deleted in the working tree
    }
    docs.push(...fileDocs(path, content));
  }
  return docs;
}

/**
 * The files changed between two commits (as they are at `head`), the messages of the commits
 * in between, and the branch name.
 * @param {string} base
 * @param {string} head
 * @param {string} branch
 * @returns {Doc[]}
 */
export function rangeDocs(base, head, branch) {
  /** @type {Doc[]} */
  const docs = [{ label: 'branch name', text: branch }];
  const shas = git(['rev-list', `${base}..${head}`])
    .split('\n')
    .filter(Boolean);
  for (const sha of shas) {
    docs.push({ label: `commit ${sha.slice(0, 12)} message`, text: git(['log', '-1', '--format=%B', sha]) });
  }
  const paths = git(['diff', '-z', '--name-only', '--diff-filter=ACMR', base, head])
    .split('\0')
    .filter(Boolean);
  for (const path of paths.sort()) {
    docs.push(...fileDocs(path, gitBuffer(['show', `${head}:${path}`])));
  }
  return docs;
}

/**
 * The commits between two local commits, for the identity check.
 * @param {string} base
 * @param {string} head
 */
export function rangeCommits(base, head) {
  const out = git(['log', '--format=%H%x00%ae%x00%ce%x00%B%x1e', `${base}..${head}`]);
  return out
    .split('\x1e')
    .map((s) => s.replace(/^\n/, ''))
    .filter(Boolean)
    .map((rec) => {
      const [sha = '', authorEmail = '', committerEmail = '', message = ''] = rec.split('\0');
      return { sha, authorEmail, committerEmail, message, signedByGitHub: false };
    });
}

/**
 * Everything a pull request adds, read through the API: its title, description, branch name,
 * commit messages, the names of the files it touches, and the lines it adds.
 * @param {any} pr the pull_request object from the event payload
 * @param {string | undefined} token
 * @returns {Promise<Doc[]>}
 */
export async function pullRequestDocs(pr, token) {
  const repo = pr.base.repo.full_name;
  /** @type {Doc[]} */
  const docs = [
    { label: 'PR title', text: pr.title ?? '' },
    { label: 'PR description', text: pr.body ?? '' },
    { label: 'branch name', text: pr.head.ref ?? '' },
  ];
  for (const c of await pullRequestCommits(pr, token)) {
    docs.push({ label: `commit ${c.sha.slice(0, 12)} message`, text: c.message });
  }
  const files = await ghList(`/repos/${repo}/pulls/${pr.number}/files`, token);
  for (const f of files) {
    const path = String(f.filename);
    docs.push({ label: path, text: path, path, isName: true });
    if (f.status === 'removed') continue;
    if (typeof f.patch === 'string') {
      const joined = joinAdded(addedLines(f.patch));
      docs.push({ label: path, text: joined.text, path, lineAt: joined.lineAt });
    } else {
      // No patch: the file is binary, a pure rename, or its diff is too large. Read the whole
      // file, as data. It is read through this repository, which serves a pull request's head
      // commit even when it comes from a fork, so this repository's token is enough.
      const res = await ghGet(`/repos/${repo}/contents/${encodePath(path)}?ref=${pr.head.sha}`, {
        token,
        accept: 'application/vnd.github.raw+json',
      });
      const content = Buffer.from(await res.arrayBuffer());
      if (!isBinary(content)) docs.push({ label: path, text: content.toString('utf8'), path });
    }
  }
  return docs;
}

/**
 * @param {any} pr
 * @param {string | undefined} token
 */
export async function pullRequestCommits(pr, token) {
  const repo = pr.base.repo.full_name;
  const commits = await ghList(`/repos/${repo}/pulls/${pr.number}/commits`, token, 3);
  return commits.map((c) => ({
    sha: String(c.sha),
    message: String(c.commit.message ?? ''),
    authorEmail: String(c.commit.author?.email ?? ''),
    committerEmail: String(c.commit.committer?.email ?? ''),
    signedByGitHub: c.commit.verification?.verified === true && c.committer?.login === 'web-flow',
  }));
}

/**
 * Formats a finding as "label:line" (or just the label for a file name). It never includes
 * the matched text.
 * @param {Doc} doc
 * @param {number} line
 */
export function location(doc, line) {
  if (doc.isName) return `${doc.label} (file name)`;
  return `${doc.label}:${doc.lineAt ? doc.lineAt(line) : line}`;
}
