// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atLeast, MIN_NPM, ORDER, pinWorkspaceDeps } from '../publish.mjs';

const versions = new Map([
  ['@wirelith/core', '0.1.0'],
  ['@wirelith/png', '0.1.0'],
]);

describe('pinWorkspaceDeps', () => {
  it('replaces each kind of workspace range', () => {
    const pkg = {
      name: '@wirelith/cli',
      dependencies: { '@wirelith/core': 'workspace:*', '@wirelith/png': 'workspace:^', other: '1.2.3' },
      devDependencies: { '@wirelith/core': 'workspace:~' },
      peerDependencies: { '@wirelith/png': 'workspace:>=0.1.0' },
    };
    const out = pinWorkspaceDeps(pkg, versions);
    expect(out.dependencies).toEqual({
      '@wirelith/core': '0.1.0',
      '@wirelith/png': '^0.1.0',
      other: '1.2.3',
    });
    expect(out.devDependencies).toEqual({ '@wirelith/core': '~0.1.0' });
    expect(out.peerDependencies).toEqual({ '@wirelith/png': '>=0.1.0' });
    expect(pkg.dependencies['@wirelith/core']).toBe('workspace:*');
  });

  it('refuses a workspace dependency that is not published', () => {
    expect(() => pinWorkspaceDeps({ name: 'x', dependencies: { y: 'workspace:*' } }, versions)).toThrow(
      /not a published package/,
    );
  });
});

describe('atLeast', () => {
  it('compares versions part by part', () => {
    expect(atLeast('11.5.1\n', MIN_NPM)).toBe(true);
    expect(atLeast('11.6.0', MIN_NPM)).toBe(true);
    expect(atLeast('12.0.0', MIN_NPM)).toBe(true);
    expect(atLeast('11.5.0', MIN_NPM)).toBe(false);
    expect(atLeast('10.9.2', MIN_NPM)).toBe(false);
  });
});

describe('ORDER', () => {
  it('lists every package after the packages it depends on', () => {
    const names = ORDER.map(
      (dir) => JSON.parse(readFileSync(join('packages', dir, 'package.json'), 'utf8')).name,
    );
    ORDER.forEach((dir, i) => {
      const pkg = JSON.parse(readFileSync(join('packages', dir, 'package.json'), 'utf8'));
      for (const dep of Object.keys(pkg.dependencies ?? {})) {
        if (names.includes(dep)) expect(names.indexOf(dep)).toBeLessThan(i);
      }
    });
  });
});
