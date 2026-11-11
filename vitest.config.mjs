// SPDX-License-Identifier: MIT

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'scripts/**/test/**/*.test.mjs',
      'spec/**/test/**/*.test.mjs',
      'conformance/test/**/*.test.mjs',
    ],
  },
});
