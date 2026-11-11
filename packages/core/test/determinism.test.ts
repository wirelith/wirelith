// SPDX-License-Identifier: MIT

// Rendering is deterministic: the same source gives the same bytes, in the same process, in
// other processes with different locales and time zones, and with options given in any order.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

const source =
  readFileSync('spec/spec.md', 'utf8').split('### 18.4')[1]?.split('```wirelith\n')[1]?.split('```')[0] ?? '';

describe('determinism', () => {
  it('found the worked example', () => {
    expect(source).toContain('screen "Orders"');
  });

  it('renders identical bytes twice in one process', () => {
    expect(render(source).svg).toBe(render(source).svg);
  });

  it('does not depend on the order options are given in', () => {
    const themes = { a: { tokens: { radius: 2, 'color.primary': '#123456' } } };
    const one = render(source, { themes, defaultTheme: 'a', idPrefix: 'p', notes: true, flows: true });
    const two = render(source, { flows: true, notes: true, idPrefix: 'p', defaultTheme: 'a', themes });
    expect(one.svg).toBe(two.svg);
  });

  it('renders identical bytes in other processes, whatever the locale and time zone', async () => {
    const { build } = await import('esbuild');
    const dir = mkdtempSync(join(tmpdir(), 'wl-det-'));
    try {
      const bundle = join(dir, 'core.mjs');
      await build({
        entryPoints: ['packages/core/src/index.ts'],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        outfile: bundle,
        logLevel: 'silent',
      });
      const script = `import { render } from ${JSON.stringify(pathToFileURL(bundle).href)};\nprocess.stdout.write(render(${JSON.stringify(source)}).svg);`;
      const here = render(source).svg;
      for (const env of [
        { TZ: 'Pacific/Kiritimati', LANG: 'ar_EG.UTF-8', LC_ALL: 'ar_EG.UTF-8' },
        { TZ: 'America/Adak', LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8' },
      ]) {
        const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
          encoding: 'utf8',
          env: { ...process.env, ...env },
        });
        expect(out).toBe(here);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
