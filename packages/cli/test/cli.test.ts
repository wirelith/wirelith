// SPDX-License-Identifier: MIT

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AI_SPEC } from '../../core/src/ai-spec.js';
import { type Io, main } from '../src/main.js';

const SIGN_IN =
  'screen "Sign in" phone #signin\n  h1 "Welcome back"\n  button "Sign in" primary -> #home\n\nscreen "Home" phone #home\n  h1 "Hello, Sam"\n';
const BROKEN = 'screen "A"\n  textfield "x"\n';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wl-cli-'));
});
afterEach(() => {
  // Windows can briefly hold a folder after a child process that used it has exited.
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** Runs the CLI in the temporary folder, capturing its output. */
async function cli(args: string[], stdin = '') {
  const out: (string | Uint8Array)[] = [];
  let err = '';
  const io: Io = {
    cwd: dir,
    readStdin: async () => stdin,
    stdout: (c) => out.push(c),
    stderr: (t) => {
      err += t;
    },
  };
  const code = await main(args, io);
  const stdout = out.map((c) => (typeof c === 'string' ? c : Buffer.from(c).toString('latin1'))).join('');
  return { code, stdout, stderr: err };
}

const file = (name: string, text: string) => {
  const p = join(dir, name);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, text);
  return p;
};

describe('render', () => {
  it('writes an SVG next to a .wirelith file', async () => {
    file('flow.wirelith', SIGN_IN);
    const r = await cli(['render', 'flow.wirelith']);
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, 'flow.svg'), 'utf8')).toMatch(/^<svg /);
  });

  it('renders every wirelith fence in a markdown file, and only those', async () => {
    file(
      'doc.md',
      `# Doc\n\n\`\`\`wirelith\n${SIGN_IN}\`\`\`\n\nText.\n\n~~~ wirelith\nscreen "Two"\n~~~\n\n\`\`\`js\nnot this\n\`\`\`\n`,
    );
    const r = await cli(['render', 'doc.md']);
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, 'doc-1.svg'))).toBe(true);
    expect(existsSync(join(dir, 'doc-2.svg'))).toBe(true);
    expect(existsSync(join(dir, 'doc-3.svg'))).toBe(false);
  });

  it('writes a PNG that carries its source, at a scale', async () => {
    file('flow.wirelith', SIGN_IN);
    const r = await cli(['render', 'flow.wirelith', '-o', 'out/flow.png', '--scale', '2']);
    expect(r.code).toBe(0);
    const png = readFileSync(join(dir, 'out/flow.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    const e = await cli(['extract', 'out/flow.png']);
    expect(e.code).toBe(0);
    expect(e.stdout).toBe(SIGN_IN);
  });

  it('renders a folder in batch, mirroring it into --out', async () => {
    file('in/a.wirelith', SIGN_IN);
    file('in/sub/b.wirelith', 'screen "B"\n');
    file('in/notes.txt', 'ignored');
    const r = await cli(['render', 'in', '-o', 'out']);
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, 'out/a.svg'))).toBe(true);
    expect(existsSync(join(dir, 'out/sub/b.svg'))).toBe(true);
  });

  it('reads standard input and writes standard output', async () => {
    const r = await cli(['render'], SIGN_IN);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^<svg /);
  });

  it('applies a theme file, the screen option, and leaves out the source', async () => {
    file(
      'brand.json',
      JSON.stringify({ name: 'brand', extends: 'ink', tokens: { 'color.primary': '#ffcc00' } }),
    );
    const r = await cli(['render', '--theme', 'brand.json', '--screen', 'home', '--no-source'], SIGN_IN);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('#16181c');
    expect(r.stdout).not.toContain('wl:source');
    expect(r.stdout).toContain('<title id="wl-title">Home</title>');
  });

  it('reports errors with line numbers in the markdown file, and exits 1', async () => {
    // The fence is indented by two spaces; its source starts on line 4.
    file('doc.md', 'Intro\n\n  ```wirelith\n  screen "A"\n    textfield "x"\n  ```\n');
    const r = await cli(['render', 'doc.md']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('doc.md:5:5: error E201');
    expect(existsSync(join(dir, 'doc-1.svg'))).toBe(false);
  });

  it('refuses to let two sources overwrite the same output, and writes nothing', async () => {
    file('a/foo.wirelith', SIGN_IN);
    file('b/foo.wirelith', 'screen "Other"\n');
    const r = await cli(['render', 'a/foo.wirelith', 'b/foo.wirelith', '-o', 'out']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('would both be written to');
    expect(existsSync(join(dir, 'out'))).toBe(false);
    // Without --out, each goes next to its own input, so there is no clash.
    expect((await cli(['render', 'a/foo.wirelith', 'b/foo.wirelith'])).code).toBe(0);
    expect(existsSync(join(dir, 'a/foo.svg')) && existsSync(join(dir, 'b/foo.svg'))).toBe(true);
  });

  it('refuses a single output file for several sources', async () => {
    file('a.wirelith', SIGN_IN);
    file('b.wirelith', SIGN_IN);
    const r = await cli(['render', 'a.wirelith', 'b.wirelith', '-o', 'one.svg']);
    expect(r.code).toBe(2);
  });
});

describe('check', () => {
  it('prints diagnostics, and exits 1 on errors only unless --strict', async () => {
    file('bad.wirelith', BROKEN);
    file('warn.wirelith', 'screen "A"\n  icon "nope"\n');
    const bad = await cli(['check', 'bad.wirelith']);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain(
      'bad.wirelith:2:3: error E201: Line 2: there is no "textfield". Did you mean "input"?',
    );
    expect(bad.stdout).toContain('hint: Use "input".');
    const warn = await cli(['check', 'warn.wirelith']);
    expect(warn.code).toBe(0);
    expect(warn.stdout).toContain('warning W301');
    expect((await cli(['check', 'warn.wirelith', '--strict'])).code).toBe(1);
  });
});

describe('fmt', () => {
  const messy = 'screen  #a "A"  phone\n   // note\n  button primary "Go"\n';
  const tidy = 'wirelith 0.1\n\nscreen "A" phone #a\n  // note\n  button "Go" primary\n';

  it('prints, checks and writes the canonical form', async () => {
    expect((await cli(['fmt'], messy)).stdout).toBe(tidy);
    file('a.wirelith', messy);
    expect((await cli(['fmt', '--check', 'a.wirelith'])).code).toBe(1);
    expect((await cli(['fmt', '--write', 'a.wirelith'])).code).toBe(0);
    expect(readFileSync(join(dir, 'a.wirelith'), 'utf8')).toBe(tidy);
    expect((await cli(['fmt', '--check', 'a.wirelith'])).code).toBe(0);
  });

  it('formats the fences of a markdown file and leaves the rest alone', async () => {
    file('doc.md', `Some *text*.\n\n\`\`\`wirelith\n${messy}\`\`\`\n\nMore.\n`);
    await cli(['fmt', '--write', 'doc.md']);
    expect(readFileSync(join(dir, 'doc.md'), 'utf8')).toBe(
      `Some *text*.\n\n\`\`\`wirelith\n${tidy}\`\`\`\n\nMore.\n`,
    );
  });

  it('refuses a source with errors', async () => {
    const r = await cli(['fmt'], BROKEN);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
  });
});

describe('extract, prompt, help and errors', () => {
  it('extracts the source from an SVG, and fails when there is none', async () => {
    file('flow.wirelith', SIGN_IN);
    await cli(['render', 'flow.wirelith']);
    expect((await cli(['extract', 'flow.svg'])).stdout).toBe(SIGN_IN);
    file('plain.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect((await cli(['extract', 'plain.svg'])).code).toBe(1);
  });

  it('prints the one-page AI spec', async () => {
    expect((await cli(['prompt'])).stdout).toBe(AI_SPEC);
  });

  it('uses distinct exit codes for usage and file errors', async () => {
    expect((await cli(['frobnicate'])).code).toBe(2);
    expect((await cli(['render', '--scale', '0'], SIGN_IN)).code).toBe(2);
    expect((await cli(['render', '--bogus'], SIGN_IN)).code).toBe(2);
    expect((await cli(['render', 'missing.wirelith'])).code).toBe(3);
    expect((await cli(['--version'])).stdout).toMatch(/^wirelith 0\.1\.0 \(specification 0\.1\)/);
    expect((await cli([])).code).toBe(2);
    expect((await cli(['--help'])).code).toBe(0);
  });
});

describe('--watch', () => {
  /** Builds the CLI into one file, so it can run as a real process. */
  async function bundle(): Promise<string> {
    const { build } = await import('esbuild');
    const out = join(dir, 'cli.mjs');
    await build({
      entryPoints: ['packages/cli/src/cli.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: out,
      logLevel: 'silent',
      external: ['@wirelith/png'],
      alias: {
        '@wirelith/core/ai-spec': resolve('packages/core/src/ai-spec.ts'),
        '@wirelith/core': resolve('packages/core/src/index.ts'),
      },
    });
    return out;
  }

  /** Starts `wirelith <args>`, collecting what it writes to standard error. */
  async function start(args: string[]) {
    const child = spawn(process.execPath, [await bundle(), ...args], { cwd: dir });
    const state = { stderr: '', code: null as number | null };
    child.stderr.on('data', (d) => {
      state.stderr += String(d);
    });
    const exited = new Promise<void>((r) =>
      child.once('exit', (code) => {
        state.code = code;
        r();
      }),
    );
    const stop = async () => {
      if (state.code === null) child.kill();
      await exited;
    };
    return { state, stop, exited };
  }

  const until = async (f: () => boolean, ms = 5000) => {
    for (let t = 0; t < ms && !f(); t += 50) await new Promise((r) => setTimeout(r, 50));
    return f();
  };
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('renders again when the input changes', async () => {
    file('w.wirelith', 'screen "Before"\n');
    const svg = () => (existsSync(join(dir, 'w.svg')) ? readFileSync(join(dir, 'w.svg'), 'utf8') : '');
    const p = await start(['render', 'w.wirelith', '--watch']);
    try {
      expect(
        await until(() => svg().includes('Before') && p.state.stderr.includes('watching for changes')),
      ).toBe(true);
      writeFileSync(join(dir, 'w.wirelith'), 'screen "After"\n');
      expect(await until(() => svg().includes('After'))).toBe(true);
    } finally {
      await p.stop();
    }
  }, 20000);

  it('is not set off again by its own output in a watched folder', async () => {
    file('designs/a.wirelith', 'screen "A"\n');
    const wrote = () => (p.state.stderr.match(/^wrote /gm) ?? []).length;
    const p = await start(['render', 'designs', '--watch']);
    try {
      expect(await until(() => p.state.stderr.includes('watching for changes'))).toBe(true);
      await pause(800);
      expect(wrote()).toBe(1);
      writeFileSync(join(dir, 'designs/a.wirelith'), 'screen "A again"\n');
      expect(await until(() => wrote() >= 2)).toBe(true);
      await pause(800);
      expect(wrote()).toBe(2);
    } finally {
      await p.stop();
    }
  }, 20000);

  it('exits when the first render fails, instead of waiting forever', async () => {
    file('a.wirelith', 'screen "A"\n');
    file('b.wirelith', 'screen "B"\n');
    const p = await start(['render', 'a.wirelith', 'b.wirelith', '-o', 'one.svg', '--watch']);
    try {
      expect(await until(() => p.state.code !== null)).toBe(true);
      expect(p.state.code).toBe(2);
    } finally {
      await p.stop();
    }
  }, 20000);
});
