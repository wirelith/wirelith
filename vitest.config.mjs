// SPDX-License-Identifier: MIT

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** @param {string} p */
const src = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests use the packages' sources, so they need no build first.
    alias: [
      { find: /^@wirelith\/core\/ai-spec$/, replacement: src('./packages/core/src/ai-spec.ts') },
      { find: /^@wirelith\/core$/, replacement: src('./packages/core/src/index.ts') },
      { find: /^@wirelith\/png$/, replacement: src('./packages/png/src/index.ts') },
    ],
  },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'scripts/**/test/**/*.test.mjs',
      'spec/**/test/**/*.test.mjs',
      'conformance/test/**/*.test.mjs',
      'eval/test/**/*.test.mjs',
    ],
  },
});
