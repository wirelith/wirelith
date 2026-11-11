// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { SPEC_VERSION } from '../src/index.js';

describe('core', () => {
  it('implements spec version 0.1', () => {
    expect(SPEC_VERSION).toBe('0.1');
  });
});
