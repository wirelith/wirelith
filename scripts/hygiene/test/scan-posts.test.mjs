// SPDX-License-Identifier: MIT

// Tests for the post scanner. All terms and posts are made up. The end-to-end tests run the
// scanner against a local stub of the GitHub API.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Denylist } from '../lib/denylist.mjs';
import { alreadyReported, matchPlaces, noticeText, reviewCommentPosts, reviewPosts } from '../lib/events.mjs';

const TERM = 'plovermoss'; // made up

describe('post helpers', () => {
  it('reads review comments and skips reviews with no text', () => {
    expect(reviewCommentPosts([{ html_url: 'u1', body: 'b' }])).toEqual([
      { kind: 'review comment', url: 'u1', fields: [{ name: 'comment', text: 'b' }] },
    ]);
    expect(
      reviewPosts([
        { html_url: 'r1', body: '' },
        { html_url: 'r2', body: null },
        { html_url: 'r3', body: 'Looks good' },
      ]).map((p) => p.url),
    ).toEqual(['r3']);
  });

  it('reports field and line, and the notice never contains the term', () => {
    const post = {
      kind: 'review',
      url: 'https://example.test/r/1',
      fields: [{ name: 'review', text: `ok\nsee ${TERM}` }],
    };
    const places = matchPlaces(new Denylist([TERM]), post);
    expect(places).toEqual(['review, line 2']);
    const notice = noticeText(post, places);
    expect(notice).toContain('Where: https://example.test/r/1\n');
    expect(notice.toLowerCase()).not.toContain(TERM);
  });

  it('recognises a post that an open draft already reports', () => {
    const drafts = [
      {
        description: noticeText({ kind: 'issue', url: 'https://example.test/i/7', fields: [] }, [
          'body, line 1',
        ]),
      },
    ];
    expect(alreadyReported(drafts, 'https://example.test/i/7')).toBe(true);
    expect(alreadyReported(drafts, 'https://example.test/i/70')).toBe(false);
    expect(alreadyReported(drafts, '')).toBe(false);
  });
});

/** @type {import('node:http').Server | undefined} */
let server;
/** @type {string | undefined} */
let dir;

afterEach(async () => {
  await new Promise((r) => (server ? server.close(() => r(undefined)) : r(undefined)));
  server = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/**
 * Starts a stub API. `advisories` is the status for listing drafts; `create` for opening one.
 * @param {{ advisories: number, create: number }} statuses
 * @returns {Promise<{ url: string, created: string[] }>}
 */
async function stub(statuses) {
  /** @type {string[]} */
  const created = [];
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      if (req.method === 'GET' && req.url?.startsWith('/repos/o/r/security-advisories')) {
        res.writeHead(statuses.advisories, { 'content-type': 'application/json' });
        res.end('[]');
      } else if (req.method === 'POST' && req.url === '/repos/o/r/security-advisories') {
        created.push(body);
        res.writeHead(statuses.create, { 'content-type': 'application/json' });
        res.end('{}');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });
  await new Promise((r) => server?.listen(0, '127.0.0.1', () => r(undefined)));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, created };
}

/**
 * Runs the scanner on an issue event.
 * @param {string} api
 * @param {string} body
 * @returns {Promise<{ status: number | null, out: string }>}
 */
function scan(api, body) {
  dir = mkdtempSync(join(tmpdir(), 'wl-scan-'));
  const event = join(dir, 'event.json');
  writeFileSync(
    event,
    JSON.stringify({ issue: { html_url: 'https://example.test/i/1', title: 'Hello', body } }),
  );
  return new Promise((done) => {
    const child = spawn(process.execPath, [resolve('scripts/hygiene/scan-posts.mjs')], {
      env: {
        PATH: process.env.PATH ?? '',
        GITHUB_API_URL: api,
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_EVENT_NAME: 'issues',
        GITHUB_EVENT_PATH: event,
        WIRELITH_DENYLIST: TERM,
        WIRELITH_TRIAGE_TOKEN: 'test-token',
      },
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      out += d;
    });
    child.on('close', (status) => done({ status, out }));
  });
}

describe('scan-posts end to end', () => {
  it('opens a private notice on a match, without the term in it', async () => {
    const api = await stub({ advisories: 200, create: 201 });
    const r = await scan(api.url, `a post about ${TERM}`);
    expect(r).toEqual({ status: 0, out: 'scan: complete.\n' });
    expect(api.created).toHaveLength(1);
    expect(api.created[0]?.toLowerCase()).not.toContain(TERM);
  });

  it('looks the same with or without a match, even when the notice fails', async () => {
    const api = await stub({ advisories: 200, create: 500 });
    const clean = await scan(api.url, 'a clean post');
    const matched = await scan(api.url, `a post about ${TERM}`);
    expect(api.created).toHaveLength(1);
    expect(matched).toEqual(clean);
    expect(clean).toEqual({ status: 0, out: 'scan: complete.\n' });
  });

  it('fails every run, match or not, when the token cannot read advisories', async () => {
    const api = await stub({ advisories: 403, create: 201 });
    const clean = await scan(api.url, 'a clean post');
    const matched = await scan(api.url, `a post about ${TERM}`);
    expect(clean.status).toBe(2);
    expect(matched).toEqual(clean);
    expect(api.created).toHaveLength(0);
  });
});
