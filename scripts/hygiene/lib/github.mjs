// SPDX-License-Identifier: MIT

// A minimal GitHub REST client for the hygiene checks. It reads data only. It never checks out
// or runs anything from a pull request.

import { readFileSync } from 'node:fs';

const API = 'https://api.github.com';

/**
 * @param {string} path
 * @param {{ token?: string | undefined, accept?: string }} [opts]
 */
export async function ghGet(path, opts = {}) {
  /** @type {Record<string, string>} */
  const headers = {
    accept: opts.accept ?? 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'wirelith-hygiene',
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path.split('?')[0]}`);
  return res;
}

/**
 * Fetches every page of a list endpoint.
 * @param {string} path
 * @param {string | undefined} token
 * @param {number} [maxPages]
 * @returns {Promise<any[]>}
 */
export async function ghList(path, token, maxPages = 30) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await ghGet(`${path}${sep}per_page=100&page=${page}`, { token });
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('expected a list');
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

/** Reads the event payload of the current GitHub Actions run. */
export function readEvent() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) throw new Error('GITHUB_EVENT_PATH is not set; this mode runs only in GitHub Actions');
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {string} s
 */
export function encodePath(s) {
  return s.split('/').map(encodeURIComponent).join('/');
}
