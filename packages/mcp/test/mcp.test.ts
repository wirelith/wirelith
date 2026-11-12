// SPDX-License-Identifier: MIT

// The server, tested with the official Model Context Protocol client: in process, and as a real
// process over standard input and output.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AI_SPEC } from '../../core/src/ai-spec.js';
import { extractPngSource } from '../../png/src/index.js';
import { AI_SPEC_URI, createServer } from '../src/server.js';

const GOOD =
  'screen "Sign in" phone #signin\n  button "Go" primary -> #home\nscreen "Home" phone #home\n  h1 "Hi"\n';
const BAD = 'screen "A"\n  textfield "x"\n';

/** Connects the official client to the server through an in-memory pair of transports. */
async function connect(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  serverSide.onmessage = (msg: JSONRPCMessage) => {
    void server.handle(JSON.stringify(msg)).then((out) => {
      if (out !== undefined) void serverSide.send(JSON.parse(out) as JSONRPCMessage);
    });
  };
  await serverSide.start();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientSide);
  return client;
}

const textOf = (r: unknown) => (r as { content: { type: string; text?: string }[] }).content[0]?.text ?? '';

describe('with the official client, in process', () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect();
  });
  afterAll(async () => {
    await client.close();
  });

  it('negotiates a protocol version and describes itself', () => {
    expect(client.getServerVersion()).toMatchObject({ name: 'wirelith', version: '0.1.0' });
    expect(client.getServerCapabilities()).toMatchObject({ tools: {}, resources: {}, prompts: {} });
    expect(client.getInstructions()).toContain(AI_SPEC_URI);
  });

  it('answers ping', async () => {
    await expect(client.ping()).resolves.toBeDefined();
  });

  it('lists the three tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['validate', 'render', 'convert']);
  });

  it('validates, with line numbers and structured diagnostics', async () => {
    const bad = await client.callTool({ name: 'validate', arguments: { source: BAD } });
    expect(textOf(bad)).toContain('2:3 error E201');
    expect(bad.structuredContent).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'E201', line: 2, column: 3 }],
    });
    const good = await client.callTool({ name: 'validate', arguments: { source: GOOD } });
    expect(good.structuredContent).toEqual({ valid: true, diagnostics: [] });
  });

  it('renders SVG and PNG, and reports errors as tool errors', async () => {
    const svg = await client.callTool({ name: 'render', arguments: { source: GOOD } });
    expect(textOf(svg)).toMatch(/^<svg /);
    const png = await client.callTool({
      name: 'render',
      arguments: { source: GOOD, format: 'png', scale: 2 },
    });
    const image = (png.content as { type: string; data: string; mimeType: string }[])[0];
    expect(image?.type).toBe('image');
    expect(image?.mimeType).toBe('image/png');
    expect(extractPngSource(new Uint8Array(Buffer.from(image?.data ?? '', 'base64')))).toBe(GOOD);
    const bad = await client.callTool({ name: 'render', arguments: { source: BAD } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain('E201');
    const screen = await client.callTool({ name: 'render', arguments: { source: GOOD, screen: 'nope' } });
    expect(screen.isError).toBe(true);
  });

  it('converts to an outline, the canonical form and the tree', async () => {
    const o = await client.callTool({ name: 'convert', arguments: { source: GOOD, to: 'outline' } });
    expect(o.structuredContent).toMatchObject({
      screens: [{ id: 'signin' }, { id: 'home' }],
      links: [{ to: 'home' }],
    });
    const f = await client.callTool({
      name: 'convert',
      arguments: { source: 'screen  "A"', to: 'formatted' },
    });
    expect(textOf(f)).toBe('wirelith 0.1\n\nscreen "A"\n');
    const t = await client.callTool({ name: 'convert', arguments: { source: GOOD, to: 'tree' } });
    expect(t.structuredContent).toMatchObject({ type: 'document', version: '0.1' });
  });

  it('rejects bad arguments', async () => {
    await expect(
      client.callTool({ name: 'render', arguments: { source: GOOD, path: '/etc/passwd' } }),
    ).rejects.toThrow(/no argument "path"/);
    await expect(
      client.callTool({ name: 'render', arguments: { source: GOOD, scale: 100 } }),
    ).rejects.toThrow();
    await expect(
      client.callTool({ name: 'convert', arguments: { source: GOOD, to: 'pdf' } }),
    ).rejects.toThrow();
    await expect(client.callTool({ name: 'nope', arguments: { source: GOOD } })).rejects.toThrow();
  });

  it('offers the one-page AI spec as a resource and a prompt', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual([AI_SPEC_URI]);
    const read = await client.readResource({ uri: AI_SPEC_URI });
    expect((read.contents[0] as { text: string }).text).toBe(AI_SPEC);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['wirelith']);
    const got = await client.getPrompt({ name: 'wirelith', arguments: { task: 'a sign-in screen' } });
    const first = got.messages[0];
    expect(first?.content.type).toBe('text');
    const body = (first?.content as { text: string } | undefined)?.text ?? '';
    expect(body.startsWith(AI_SPEC)).toBe(true);
    expect(body).toContain('Task: a sign-in screen');
  });
});

describe('the raw protocol', () => {
  it('answers malformed messages with JSON-RPC errors and ignores notifications', async () => {
    const s = createServer();
    expect(JSON.parse((await s.handle('{not json')) ?? '{}').error.code).toBe(-32700);
    expect(JSON.parse((await s.handle('[]')) ?? '{}').error.code).toBe(-32600);
    // Valid JSON that is not an object is not a message, and must not crash the server.
    for (const v of ['null', '5', '"text"', 'true']) {
      expect(JSON.parse((await s.handle(v)) ?? '{}').error.code, v).toBe(-32600);
    }
    expect(JSON.parse((await s.handle('{"jsonrpc":"2.0","id":1,"method":"nope"}')) ?? '{}').error.code).toBe(
      -32601,
    );
    expect(await s.handle('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toBeUndefined();
    expect(
      await s.handle(`{"jsonrpc":"2.0","id":2,"method":"ping","params":{"x":"${'a'.repeat(1024 * 1024)}"}}`),
    ).toContain('-32600');
  });
});

describe('as a process over standard input and output', () => {
  let dir = '';
  let bundle = '';
  beforeAll(async () => {
    const { build } = await import('esbuild');
    dir = mkdtempSync(join(tmpdir(), 'wl-mcp-'));
    bundle = join(dir, 'bin.mjs');
    await build({
      entryPoints: ['packages/mcp/src/bin.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: bundle,
      logLevel: 'silent',
      external: ['@wirelith/png'],
      alias: {
        '@wirelith/core/ai-spec': resolve('packages/core/src/ai-spec.ts'),
        '@wirelith/core': resolve('packages/core/src/index.ts'),
      },
    });
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts, validates and renders', async () => {
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [bundle], stderr: 'pipe' }),
    );
    try {
      const v = await client.callTool({ name: 'validate', arguments: { source: BAD } });
      expect(v.structuredContent).toMatchObject({ valid: false });
      const r = await client.callTool({ name: 'render', arguments: { source: GOOD } });
      expect(textOf(r)).toMatch(/^<svg /);
    } finally {
      await client.close();
    }
  }, 20000);
});

describe('no network', () => {
  it('imports nothing that can open a connection', () => {
    for (const f of readdirSync('packages/mcp/src')) {
      const text = readFileSync(join('packages/mcp/src', f), 'utf8');
      expect(text, f).not.toMatch(
        /from ['"](node:)?(net|http|https|http2|dgram|tls|dns|child_process|worker_threads)['"]/,
      );
      expect(text, f).not.toMatch(/\bfetch\s*\(|\bWebSocket\b|\.listen\s*\(/);
    }
  });
});
