// SPDX-License-Identifier: MIT

// A Model Context Protocol server for Wirelith. It speaks JSON-RPC 2.0, one message per line, and
// is transport-agnostic: `bin.ts` connects it to standard input and output. It has no network
// listener, sends no telemetry, and reads no files: every tool works on the text it is given.

import {
  type Diagnostic,
  format,
  type HostTheme,
  type Options,
  outline,
  parse,
  render,
  SPEC_VERSION,
  validate,
} from '@wirelith/core';
import { AI_SPEC } from '@wirelith/core/ai-spec';

/** Protocol versions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER_NAME = 'wirelith';
export const SERVER_VERSION = '0.1.0';
export const AI_SPEC_URI = 'wirelith://spec/ai-spec';

/** Longest message accepted, in UTF-16 code units: a 64 KB source, escaped, fits easily. */
export const MAX_MESSAGE = 1024 * 1024;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Request {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface Response {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const INSTRUCTIONS = `Wirelith is a plain-text language for low-fidelity wireframes. Before writing a source, read the resource ${AI_SPEC_URI} (or the "wirelith" prompt): it describes the whole language on one page. Then use validate to check a source and fix every error it reports, render to draw it as SVG or PNG, and convert for its outline, its canonical form or its syntax tree.`;

const sourceProp = { type: 'string', description: 'The Wirelith source text.' };
const themeProp = {
  type: 'object',
  description: 'A theme to use when the source names none: { "name", "extends"?, "tokens"? }.',
  properties: {
    name: { type: 'string' },
    extends: { type: 'string' },
    tokens: { type: 'object', additionalProperties: { type: ['string', 'number'] } },
  },
  required: ['name'],
};

export const TOOLS = [
  {
    name: 'validate',
    title: 'Validate a Wirelith source',
    description:
      'Checks a Wirelith source and returns its diagnostics: code, severity, line, column, message and hint. Errors must be fixed before the source can be rendered.',
    inputSchema: {
      type: 'object',
      properties: { source: sourceProp, theme: themeProp },
      required: ['source'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        diagnostics: { type: 'array', items: { type: 'object' } },
      },
      required: ['valid', 'diagnostics'],
    },
  },
  {
    name: 'render',
    title: 'Render a Wirelith source',
    description:
      'Renders a Wirelith source to SVG (as text) or PNG (as an image). Fails with the diagnostics when the source has errors.',
    inputSchema: {
      type: 'object',
      properties: {
        source: sourceProp,
        format: { type: 'string', enum: ['svg', 'png'], description: 'Default svg.' },
        scale: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 8,
          description: 'PNG pixels per SVG pixel. Default 1.',
        },
        screen: { type: 'string', description: 'The id of one screen, modal or drawer to draw on its own.' },
        theme: themeProp,
        notes: { type: 'boolean', description: 'Draw notes. Default true.' },
        flows: { type: 'boolean', description: 'Draw arrows. Default true.' },
        embedSource: { type: 'boolean', description: 'Embed the source in the output. Default true.' },
      },
      required: ['source'],
      additionalProperties: false,
    },
  },
  {
    name: 'convert',
    title: 'Convert a Wirelith source',
    description:
      'Converts a Wirelith source: "outline" lists its screens, overlays and links; "formatted" is its canonical form, with comments kept; "tree" is its syntax tree as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        source: sourceProp,
        to: { type: 'string', enum: ['outline', 'formatted', 'tree'] },
      },
      required: ['source', 'to'],
      additionalProperties: false,
    },
  },
] as const;

const PROMPT = {
  name: 'wirelith',
  title: 'Write Wirelith wireframes',
  description: 'The one-page description of the Wirelith language, optionally followed by a task.',
  arguments: [
    {
      name: 'task',
      description: 'What to draw, for example "a sign-in screen for a phone".',
      required: false,
    },
  ],
};

function asObject(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new RpcError(-32602, `${what} must be an object`);
  return v as Record<string, unknown>;
}

function str(args: Record<string, unknown>, key: string, required: boolean): string | undefined {
  const v = args[key];
  if (v === undefined && !required) return undefined;
  if (typeof v !== 'string') throw new RpcError(-32602, `"${key}" must be a string`);
  return v;
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new RpcError(-32602, `"${key}" must be true or false`);
  return v;
}

function themeOptions(args: Record<string, unknown>): Options {
  if (args.theme === undefined) return {};
  const t = asObject(args.theme, '"theme"');
  const name = str(t, 'name', true) as string;
  const host: HostTheme = {};
  const ext = str(t, 'extends', false);
  if (ext !== undefined) host.extends = ext;
  if (t.tokens !== undefined) {
    const tokens = asObject(t.tokens, '"theme.tokens"');
    for (const v of Object.values(tokens)) {
      if (typeof v !== 'string' && typeof v !== 'number')
        throw new RpcError(-32602, 'theme token values must be strings or numbers');
    }
    host.tokens = tokens as Record<string, string | number>;
  }
  return { themes: { [name]: host }, defaultTheme: name };
}

/** Diagnostics as lines a model can read and act on. */
function describe(ds: Diagnostic[]): string {
  if (ds.length === 0) return 'No problems found.';
  return ds
    .map(
      (d) =>
        `${d.line}:${d.column} ${d.severity} ${d.code}: ${d.message}${d.hint ? ` (hint: ${d.hint})` : ''}`,
    )
    .join('\n');
}

const text = (t: string) => ({ type: 'text', text: t });

async function callTool(name: string, rawArgs: unknown): Promise<unknown> {
  const args = asObject(rawArgs ?? {}, '"arguments"');
  const source = str(args, 'source', true) as string;
  const known = TOOLS.find((t) => t.name === name);
  if (!known) throw new RpcError(-32602, `unknown tool "${name}"`);
  for (const k of Object.keys(args)) {
    if (!(k in known.inputSchema.properties)) throw new RpcError(-32602, `"${name}" has no argument "${k}"`);
  }

  if (name === 'validate') {
    const diagnostics = validate(source, themeOptions(args));
    const valid = !diagnostics.some((d) => d.severity === 'error');
    return { content: [text(describe(diagnostics))], structuredContent: { valid, diagnostics } };
  }

  if (name === 'render') {
    const options = themeOptions(args);
    const screen = str(args, 'screen', false);
    if (screen !== undefined) options.screen = screen;
    for (const k of ['notes', 'flows', 'embedSource'] as const) {
      const v = bool(args, k);
      if (v !== undefined) options[k] = v;
    }
    const fmt = str(args, 'format', false) ?? 'svg';
    if (fmt !== 'svg' && fmt !== 'png') throw new RpcError(-32602, '"format" must be svg or png');
    const scale = args.scale === undefined ? 1 : args.scale;
    if (typeof scale !== 'number' || !(scale > 0 && scale <= 8))
      throw new RpcError(-32602, '"scale" must be greater than 0 and at most 8');
    let result: ReturnType<typeof render>;
    try {
      result = render(source, options);
    } catch (e) {
      // The screen option names something that isn't a screen or overlay: the caller's mistake.
      return { content: [text((e as Error).message)], isError: true };
    }
    if (result.svg === null) {
      return {
        content: [text(`The source has errors and was not rendered:\n${describe(result.diagnostics)}`)],
        isError: true,
      };
    }
    const notes = result.diagnostics.length > 0 ? [text(`Warnings:\n${describe(result.diagnostics)}`)] : [];
    if (fmt === 'svg') return { content: [text(result.svg), ...notes] };
    const { svgToPng } = await import('@wirelith/png');
    const png = svgToPng(result.svg, options.embedSource === false ? { scale } : { scale, source });
    return {
      content: [
        { type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' },
        ...notes,
      ],
    };
  }

  // convert
  const to = str(args, 'to', true);
  if (to === 'formatted') {
    const out = format(source);
    if (out === null)
      return {
        content: [text(`The source has errors and can't be formatted:\n${describe(validate(source))}`)],
        isError: true,
      };
    return { content: [text(out)] };
  }
  if (to === 'outline') {
    const o = outline(source);
    if (o.outline === null)
      return { content: [text(`The source has errors:\n${describe(o.diagnostics)}`)], isError: true };
    return { content: [text(JSON.stringify(o.outline, null, 2))], structuredContent: o.outline };
  }
  if (to === 'tree') {
    const p = parse(source);
    if (p.diagnostics.some((d) => d.severity === 'error')) {
      return { content: [text(`The source has syntax errors:\n${describe(p.diagnostics)}`)], isError: true };
    }
    return { content: [text(JSON.stringify(p.tree, null, 2))], structuredContent: p.tree };
  }
  throw new RpcError(-32602, '"to" must be outline, formatted or tree');
}

async function dispatch(method: string, params: unknown, state: { initialized: boolean }): Promise<unknown> {
  switch (method) {
    case 'initialize': {
      const p = asObject(params ?? {}, 'params');
      const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : '';
      state.initialized = true;
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
          prompts: { listChanged: false },
        },
        serverInfo: { name: SERVER_NAME, title: 'Wirelith', version: SERVER_VERSION },
        instructions: INSTRUCTIONS,
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const p = asObject(params, 'params');
      return callTool(str(p, 'name', true) as string, p.arguments);
    }
    case 'resources/list':
      return {
        resources: [
          {
            uri: AI_SPEC_URI,
            name: 'ai-spec',
            title: 'Wirelith in one page',
            description: `The whole Wirelith language (specification ${SPEC_VERSION}) on one page, for writing sources.`,
            mimeType: 'text/markdown',
          },
        ],
      };
    case 'resources/templates/list':
      return { resourceTemplates: [] };
    case 'resources/read': {
      const uri = str(asObject(params, 'params'), 'uri', true);
      if (uri !== AI_SPEC_URI) throw new RpcError(-32002, `no resource ${uri}`);
      return { contents: [{ uri: AI_SPEC_URI, mimeType: 'text/markdown', text: AI_SPEC }] };
    }
    case 'prompts/list':
      return { prompts: [PROMPT] };
    case 'prompts/get': {
      const p = asObject(params, 'params');
      if (str(p, 'name', true) !== PROMPT.name) throw new RpcError(-32602, `no prompt ${String(p.name)}`);
      const args = p.arguments === undefined ? {} : asObject(p.arguments, '"arguments"');
      const task = str(args, 'task', false);
      const body = `${AI_SPEC}\n\n---\n\nWrite Wirelith using only what is described above. Check your source with the validate tool and fix every error before rendering it.${task ? `\n\nTask: ${task}` : ''}`;
      return { description: PROMPT.description, messages: [{ role: 'user', content: text(body) }] };
    }
    default:
      throw new RpcError(-32601, `method not found: ${method}`);
  }
}

/** A server: give it each incoming line; it returns the line to send back, if any. */
export function createServer() {
  const state = { initialized: false };
  return {
    async handle(line: string): Promise<string | undefined> {
      if (line.trim() === '') return undefined;
      if (line.length > MAX_MESSAGE)
        return reply({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'message too large' } });
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        return reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      }
      if (Array.isArray(msg)) {
        return reply({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'batches are not supported' },
        });
      }
      // null, numbers, strings and booleans are valid JSON but not messages.
      if (typeof msg !== 'object' || msg === null) {
        return reply({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request' } });
      }
      const m = msg as Partial<Request>;
      const id = typeof m.id === 'string' || typeof m.id === 'number' ? m.id : null;
      const isNotification = m.id === undefined;
      if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
        // Responses from the client (we send no requests) and malformed messages.
        return isNotification || !('method' in (m as object))
          ? undefined
          : reply({ jsonrpc: '2.0', id, error: { code: -32600, message: 'invalid request' } });
      }
      if (isNotification) return undefined; // notifications/initialized, notifications/cancelled, …
      try {
        const result = await dispatch(m.method, m.params, state);
        return reply({ jsonrpc: '2.0', id, result });
      } catch (e) {
        if (e instanceof RpcError)
          return reply({ jsonrpc: '2.0', id, error: { code: e.code, message: e.message } });
        return reply({ jsonrpc: '2.0', id, error: { code: -32603, message: 'internal error' } });
      }
    },
  };
}

function reply(r: Response): string {
  return JSON.stringify(r as unknown as Json);
}
