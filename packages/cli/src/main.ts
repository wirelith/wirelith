// SPDX-License-Identifier: MIT

// The `wirelith` command. `main` takes the arguments and the streams, and returns the exit code,
// so it can be tested without a process.
//
// Exit codes: 0 when everything worked; 1 when a source has errors, or `fmt --check` found a file
// to change; 2 for a usage error; 3 when a file can't be read or written.

import {
  existsSync,
  type FSWatcher,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { type ParseArgsOptionsConfig, parseArgs } from 'node:util';
import {
  type Diagnostic,
  extractSource,
  format,
  type Options,
  render,
  SPEC_VERSION,
  validate,
} from '@wirelith/core';
import { AI_SPEC } from '@wirelith/core/ai-spec';
import { findFences, replaceFences } from './markdown.js';

export interface Io {
  readStdin(): Promise<string>;
  stdout(chunk: string | Uint8Array): void;
  stderr(text: string): void;
  cwd: string;
}

/** One source to work on: a file, a fence in a markdown file, or stdin. */
interface Source {
  /** For messages: the path, or `<stdin>`. */
  label: string;
  source: string;
  /** The file it came from, if any. */
  file?: string;
  /** For a fence: its number from 1, its first line, and its indentation. */
  fence?: { n: number; firstLine: number; indent: number };
  /** The folder given on the command line that this file was found in, if any. */
  root?: string;
}

class UsageError extends Error {}
class FileError extends Error {}

const HELP = `wirelith: plain-text wireframes

Usage:
  wirelith render [inputs...] [options]   Render to SVG or PNG
  wirelith check [inputs...] [options]    Report diagnostics; exit 1 on errors
  wirelith fmt [inputs...] [--write | --check]
                                          Write sources in canonical form
  wirelith extract <file.svg | file.png>  Print the source embedded in an SVG or PNG
  wirelith prompt                         Print the one-page description for AI agents

Inputs are .wirelith files, .md files (every \`\`\`wirelith fence in them), folders (searched
for both), or - for standard input. With no inputs, standard input is read.

Render options:
  -o, --out <path>        Output file, or folder for several outputs. Default: next to each
                          input, or standard output for standard input.
  --format <svg|png>      Default: from the output file's extension, else svg
  --scale <n>             PNG pixels per SVG pixel (default 1)
  --theme <file.json>     A theme { "name", "extends", "tokens" }, used as the default theme
  --screen <id>           Render one screen, modal or drawer
  --no-notes              Leave out notes
  --no-flows              Leave out arrows
  --no-source             Don't embed the source in the output
  --id-prefix <prefix>    Prefix for ids in the SVG (default wl)
  --watch                 Render again when an input changes

Check options:
  --theme <file.json>     As for render
  --strict                Exit 1 on warnings too

Other:
  -h, --help              Show this help
  -v, --version           Show the version
`;

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return `wirelith ${pkg.version} (specification ${SPEC_VERSION})`;
  } catch {
    return `wirelith (specification ${SPEC_VERSION})`;
  }
}

/** Reads a file, turning failures into FileError. */
function read(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch (e) {
    throw new FileError(`cannot read ${path}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`);
  }
}

function write(path: string, data: string | Uint8Array): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  } catch (e) {
    throw new FileError(`cannot write ${path}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`);
  }
}

/** All .wirelith and .md files under a folder, in a stable order. */
function walkFolder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFolder(p));
    else if (/\.(wirelith|md)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Turns the command line's inputs into sources. */
async function collect(inputs: string[], io: Io): Promise<Source[]> {
  if (inputs.length === 0 || (inputs.length === 1 && inputs[0] === '-')) {
    return [{ label: '<stdin>', source: await io.readStdin() }];
  }
  const out: Source[] = [];
  for (const input of inputs) {
    if (input === '-') throw new UsageError('- (standard input) cannot be combined with other inputs');
    const path = resolve(io.cwd, input);
    if (!existsSync(path)) throw new FileError(`${input} does not exist`);
    const files = statSync(path).isDirectory() ? walkFolder(path) : [path];
    for (const file of files) {
      const text = read(file).toString('utf8');
      const label = relative(io.cwd, file) || file;
      const root = statSync(path).isDirectory() ? path : undefined;
      if (extname(file) === '.md') {
        findFences(text).forEach((f, i) => {
          const s: Source = {
            label: `${label} (fence ${i + 1})`,
            source: f.source,
            file,
            fence: { n: i + 1, firstLine: f.firstLine, indent: f.indent },
          };
          if (root) s.root = root;
          out.push(s);
        });
      } else {
        const s: Source = { label, source: text, file };
        if (root) s.root = root;
        out.push(s);
      }
    }
  }
  return out;
}

/** "file:line:column: severity code: message", with lines mapped into a markdown file. */
function describe(s: Source, d: Diagnostic): string {
  const where = s.fence
    ? `${relativeOr(s)}:${s.fence.firstLine + d.line - 1}:${d.column + s.fence.indent}`
    : `${s.label}:${d.line}:${d.column}`;
  return `${where}: ${d.severity} ${d.code}: ${d.message}${d.hint ? `\n  hint: ${d.hint}` : ''}`;
}

function relativeOr(s: Source): string {
  return s.label.replace(/ \(fence \d+\)$/, '');
}

function themeOptions(path: string | undefined, io: Io): Options {
  if (path === undefined) return {};
  let theme: unknown;
  try {
    theme = JSON.parse(read(resolve(io.cwd, path)).toString('utf8'));
  } catch (e) {
    if (e instanceof FileError) throw e;
    throw new UsageError(`${path} is not valid JSON`);
  }
  const t = theme as { name?: unknown; extends?: unknown; tokens?: unknown };
  if (!t || typeof t !== 'object' || typeof t.name !== 'string' || !/^[A-Za-z0-9\-_.:%/]+$/.test(t.name)) {
    throw new UsageError(
      `${path} must be a JSON object with a "name", and optionally "extends" and "tokens"`,
    );
  }
  const host: { extends?: string; tokens?: Record<string, string | number> } = {};
  if (typeof t.extends === 'string') host.extends = t.extends;
  if (t.tokens && typeof t.tokens === 'object') host.tokens = t.tokens as Record<string, string | number>;
  return { themes: { [t.name]: host }, defaultTheme: t.name };
}

// ---- render ------------------------------------------------------------------------------------

interface RenderFlags {
  out?: string | undefined;
  format?: string | undefined;
  scale?: string | undefined;
  theme?: string | undefined;
  screen?: string | undefined;
  'no-notes'?: boolean | undefined;
  'no-flows'?: boolean | undefined;
  'no-source'?: boolean | undefined;
  'id-prefix'?: string | undefined;
  watch?: boolean | undefined;
}

function outputPath(s: Source, flags: RenderFlags, many: boolean, ext: string, io: Io): string | undefined {
  const out = flags.out !== undefined ? resolve(io.cwd, flags.out) : undefined;
  const isDir =
    out !== undefined &&
    (flags.out?.endsWith('/') || (existsSync(out) && statSync(out).isDirectory()) || many);
  if (!s.file) return out && !isDir ? out : out ? join(out, `stdin${ext}`) : undefined;
  const base = basename(s.file, extname(s.file)) + (s.fence ? `-${s.fence.n}` : '');
  if (out && !isDir) return out;
  if (out) {
    const rel = s.root ? relative(s.root, dirname(s.file)) : '';
    return join(out, rel, base + ext);
  }
  return join(dirname(s.file), base + ext);
}

async function renderCommand(inputs: string[], flags: RenderFlags, io: Io): Promise<number> {
  const options: Options = themeOptions(flags.theme, io);
  if (flags.screen !== undefined) options.screen = flags.screen;
  if (flags['no-notes']) options.notes = false;
  if (flags['no-flows']) options.flows = false;
  if (flags['no-source']) options.embedSource = false;
  if (flags['id-prefix'] !== undefined) options.idPrefix = flags['id-prefix'];
  const scale = flags.scale === undefined ? 1 : Number(flags.scale);
  if (!(scale > 0 && scale <= 8))
    throw new UsageError('--scale must be a number greater than 0 and at most 8');
  const fmt = flags.format ?? (flags.out && extname(flags.out) === '.png' ? 'png' : 'svg');
  if (fmt !== 'svg' && fmt !== 'png') throw new UsageError('--format must be svg or png');
  const ext = `.${fmt}`;

  const run = async (): Promise<number> => {
    const sources = await collect(inputs, io);
    const many = sources.length > 1;
    if (many && flags.out && extname(flags.out) !== '' && !existsSync(resolve(io.cwd, flags.out))) {
      throw new UsageError(`there are ${sources.length} sources; --out must be a folder`);
    }
    // Work out every output first, so that two sources can never overwrite each other.
    const destinations = new Map<string, string>();
    for (const s of sources) {
      const path = outputPath(s, flags, many, ext, io);
      if (path === undefined) continue;
      const other = destinations.get(path);
      if (other !== undefined) {
        throw new UsageError(
          `${other} and ${s.label} would both be written to ${relative(io.cwd, path) || path}; rename one, or render them separately`,
        );
      }
      destinations.set(path, s.label);
    }
    let failed = 0;
    for (const s of sources) {
      let result: ReturnType<typeof render>;
      try {
        result = render(s.source, options);
      } catch (e) {
        throw new UsageError((e as Error).message);
      }
      for (const d of result.diagnostics) io.stderr(`${describe(s, d)}\n`);
      if (result.svg === null) {
        failed++;
        continue;
      }
      let data: string | Uint8Array = result.svg;
      if (fmt === 'png') {
        // Loaded only when needed: it carries the rasteriser and the fonts.
        const { svgToPng } = await import('@wirelith/png');
        data = svgToPng(result.svg, flags['no-source'] ? { scale } : { scale, source: s.source });
      }
      const path = outputPath(s, flags, many, ext, io);
      if (path === undefined) io.stdout(data);
      else {
        write(path, data);
        io.stderr(`wrote ${relative(io.cwd, path) || path}\n`);
      }
    }
    if (failed > 0) io.stderr(`${failed} of ${sources.length} sources have errors and were not rendered\n`);
    return failed > 0 ? 1 : 0;
  };

  if (!flags.watch) return await run();
  if (inputs.length === 0 || inputs.includes('-'))
    throw new UsageError('--watch needs files or folders, not standard input');
  // Start watching before the first render, so that no change made meanwhile is missed. Only
  // changes to sources count: the command's own SVG and PNG output must not set it off again.
  let timer: NodeJS.Timeout | undefined;
  const watchers: FSWatcher[] = [];
  const stop = () => {
    for (const w of watchers) w.close();
  };
  try {
    for (const input of inputs) {
      const path = resolve(io.cwd, input);
      if (!existsSync(path)) throw new FileError(`${input} does not exist`);
      watchers.push(
        watch(path, { recursive: statSync(path).isDirectory() }, (_event, filename) => {
          if (filename && !/\.(wirelith|md)$/.test(String(filename))) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            run().catch((e: Error) => io.stderr(`${e.message}\n`));
          }, 100);
        }),
      );
    }
    await run();
  } catch (e) {
    // Nothing to watch for after a usage or file error: let the process end.
    stop();
    throw e;
  }
  io.stderr('watching for changes; press Ctrl+C to stop\n');
  return new Promise<number>(() => {});
}

// ---- check ---------------------------------------------------------------------------------------

async function checkCommand(
  inputs: string[],
  flags: { theme?: string | undefined; strict?: boolean | undefined },
  io: Io,
): Promise<number> {
  const options = themeOptions(flags.theme, io);
  const sources = await collect(inputs, io);
  let errors = 0;
  let warnings = 0;
  for (const s of sources) {
    for (const d of validate(s.source, options)) {
      io.stdout(`${describe(s, d)}\n`);
      if (d.severity === 'error') errors++;
      else warnings++;
    }
  }
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  io.stderr(
    `${plural(errors, 'error')}, ${plural(warnings, 'warning')} in ${plural(sources.length, 'source')}\n`,
  );
  return errors > 0 || (flags.strict && warnings > 0) ? 1 : 0;
}

// ---- fmt ------------------------------------------------------------------------------------------

async function fmtCommand(
  inputs: string[],
  flags: { write?: boolean | undefined; check?: boolean | undefined },
  io: Io,
): Promise<number> {
  if (flags.write && flags.check) throw new UsageError('use --write or --check, not both');
  if (inputs.length === 0 || (inputs.length === 1 && inputs[0] === '-')) {
    if (flags.write) throw new UsageError('--write needs files, not standard input');
    const source = await io.readStdin();
    const out = format(source);
    if (out === null) {
      io.stderr('<stdin>: cannot format a source with errors; run wirelith check\n');
      return 1;
    }
    if (flags.check) {
      if (out === source) return 0;
      io.stderr('<stdin> is not formatted\n');
      return 1;
    }
    io.stdout(out);
    return 0;
  }
  const files: string[] = [];
  for (const input of inputs) {
    const path = resolve(io.cwd, input);
    if (!existsSync(path)) throw new FileError(`${input} does not exist`);
    files.push(...(statSync(path).isDirectory() ? walkFolder(path) : [path]));
  }
  if (!flags.write && !flags.check && files.length > 1)
    throw new UsageError('with several files, use --write or --check');
  let bad = 0;
  for (const file of files) {
    const text = read(file).toString('utf8');
    const label = relative(io.cwd, file) || file;
    let out: string | null;
    if (extname(file) === '.md') {
      const formatted = findFences(text).map((f) => format(f.source));
      if (formatted.some((f) => f === null)) {
        io.stderr(`${label}: cannot format a fence with errors; run wirelith check\n`);
        bad++;
        continue;
      }
      out = replaceFences(text, formatted as string[]);
    } else {
      out = format(text);
      if (out === null) {
        io.stderr(`${label}: cannot format a source with errors; run wirelith check\n`);
        bad++;
        continue;
      }
    }
    if (flags.check) {
      if (out !== text) {
        io.stderr(`${label} is not formatted\n`);
        bad++;
      }
    } else if (flags.write) {
      if (out !== text) {
        write(file, out);
        io.stderr(`formatted ${label}\n`);
      }
    } else {
      io.stdout(out);
    }
  }
  return bad > 0 ? 1 : 0;
}

// ---- extract ----------------------------------------------------------------------------------------

async function extractCommand(inputs: string[], io: Io): Promise<number> {
  if (inputs.length !== 1) throw new UsageError('extract takes one SVG or PNG file');
  const data = read(resolve(io.cwd, inputs[0] as string));
  const isPng = data.length > 8 && data[0] === 0x89 && data[1] === 0x50;
  const source = isPng
    ? (await import('@wirelith/png')).extractPngSource(new Uint8Array(data))
    : extractSource(data.toString('utf8'));
  if (source === null) {
    io.stderr(`${inputs[0]} has no embedded Wirelith source\n`);
    return 1;
  }
  io.stdout(source);
  return 0;
}

// ---- main ---------------------------------------------------------------------------------------------

export async function main(argv: string[], io: Io): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
      io.stdout(HELP);
      return command === undefined ? 2 : 0;
    }
    if (command === '-v' || command === '--version') {
      io.stdout(`${version()}\n`);
      return 0;
    }
    type Parsed = { values: Record<string, string | boolean | undefined>; positionals: string[] };
    const parse = (options: ParseArgsOptionsConfig): Parsed => {
      try {
        return parseArgs({
          args: rest,
          options: { ...options, help: { type: 'boolean', short: 'h' } },
          allowPositionals: true,
          strict: true,
        }) as Parsed;
      } catch (e) {
        throw new UsageError((e as Error).message);
      }
    };
    switch (command) {
      case 'render': {
        const a = parse({
          out: { type: 'string', short: 'o' },
          format: { type: 'string' },
          scale: { type: 'string' },
          theme: { type: 'string' },
          screen: { type: 'string' },
          'no-notes': { type: 'boolean' },
          'no-flows': { type: 'boolean' },
          'no-source': { type: 'boolean' },
          'id-prefix': { type: 'string' },
          watch: { type: 'boolean' },
        });
        if (a.values.help) {
          io.stdout(HELP);
          return 0;
        }
        return await renderCommand(a.positionals, a.values as RenderFlags, io);
      }
      case 'check': {
        const a = parse({ theme: { type: 'string' }, strict: { type: 'boolean' } });
        if (a.values.help) {
          io.stdout(HELP);
          return 0;
        }
        return await checkCommand(a.positionals, a.values as { theme?: string; strict?: boolean }, io);
      }
      case 'fmt': {
        const a = parse({ write: { type: 'boolean' }, check: { type: 'boolean' } });
        if (a.values.help) {
          io.stdout(HELP);
          return 0;
        }
        return await fmtCommand(a.positionals, a.values as { write?: boolean; check?: boolean }, io);
      }
      case 'extract': {
        const a = parse({});
        if (a.values.help) {
          io.stdout(HELP);
          return 0;
        }
        return await extractCommand(a.positionals, io);
      }
      case 'prompt':
        io.stdout(AI_SPEC);
        return 0;
      default:
        throw new UsageError(`unknown command "${command}"; run wirelith --help`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`wirelith: ${e.message}\n`);
      return 2;
    }
    if (e instanceof FileError) {
      io.stderr(`wirelith: ${e.message}\n`);
      return 3;
    }
    throw e;
  }
}
