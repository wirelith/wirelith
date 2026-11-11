// SPDX-License-Identifier: MIT

// Every term below is made up for these tests.

import { describe, expect, it } from 'vitest';
import { compileTerm, Denylist, loadDenylist, parseTerms } from '../lib/denylist.mjs';

/** @param {string[]} terms */
const list = (...terms) => new Denylist(terms);

describe('parseTerms', () => {
  it('reads one term per line and skips blank lines and # lines', () => {
    const text = '# a comment\n\nzorblax\n  quell fen  \n   # indented comment\r\nwimbrel\n';
    expect(parseTerms(text)).toEqual(['zorblax', 'quell fen', 'wimbrel']);
  });
});

describe('letter case', () => {
  it('ignores case in both the term and the text', () => {
    expect(list('Zorblax').matches('we met ZORBLAX today')).toBe(true);
    expect(list('ZORBLAX').matches('zorblax')).toBe(true);
  });

  it('ignores case outside ASCII', () => {
    expect(list('Ünterquall').matches('the ünterquall team')).toBe(true);
  });
});

describe('whole words and phrases only', () => {
  it('does not match inside a longer word', () => {
    const d = list('orb');
    expect(d.matches('zorblax')).toBe(false);
    expect(d.matches('orbit')).toBe(false);
    expect(d.matches('sorb')).toBe(false);
  });

  it('does not match next to a digit', () => {
    const d = list('orb');
    expect(d.matches('orb2')).toBe(false);
    expect(d.matches('2orb')).toBe(false);
  });

  it('does not match next to an accented letter or a combining mark', () => {
    const d = list('cafe');
    expect(d.matches('cafeé')).toBe(false);
    expect(d.matches('café')).toBe(false);
  });

  it('matches when followed or preceded by punctuation, a hyphen or a slash', () => {
    const d = list('orb');
    for (const text of [
      'orb.',
      'orb,',
      'orb-x',
      'x-orb',
      'orb/x',
      'a/orb',
      '(orb)',
      '"orb"',
      "orb's",
      '#orb',
      '@orb',
      'orb_',
    ]) {
      expect(d.matches(text), text).toBe(true);
    }
  });

  it('matches at the start and end of the text', () => {
    expect(list('orb').matches('orb')).toBe(true);
  });
});

describe('whitespace inside a term', () => {
  it('matches any run of whitespace, including line breaks and tabs', () => {
    const d = list('quell fen');
    expect(d.matches('quell fen')).toBe(true);
    expect(d.matches('quell    fen')).toBe(true);
    expect(d.matches('quell\tfen')).toBe(true);
    expect(d.matches('quell\n   fen')).toBe(true);
    expect(d.matches('quell\r\nfen')).toBe(true);
  });

  it('a run of whitespace in the term matches a single space', () => {
    expect(list('quell   fen').matches('quell fen')).toBe(true);
  });

  it('needs whitespace where the term has it', () => {
    expect(list('quell fen').matches('quellfen')).toBe(false);
    expect(list('quell fen').matches('quell-fen')).toBe(false);
  });

  it('reports the line where a phrase starts', () => {
    expect(list('quell fen').lines('one\ntwo quell\nfen three')).toEqual([2]);
  });
});

describe('terms are literal text', () => {
  it('treats pattern characters as themselves', () => {
    expect(list('a.c').matches('abc')).toBe(false);
    expect(list('a.c').matches('a.c')).toBe(true);
    expect(list('wim*').matches('wimmm')).toBe(false);
    expect(list('wim*').matches('wim*')).toBe(true);
    expect(list('(fen)').matches('fen')).toBe(false);
    expect(list('[fen]').matches('f')).toBe(false);
    expect(list('fen|orb').matches('orb')).toBe(false);
    expect(list('fen$').matches('fen$ ')).toBe(true);
    expect(list('^fen').matches('^fen')).toBe(true);
    expect(list('a\\d').matches('a1')).toBe(false);
    expect(list('a\\d').matches('a\\d')).toBe(true);
  });

  it('handles terms made of or ending in punctuation', () => {
    expect(list('quell++').matches('use quell++ now')).toBe(true);
    expect(list('fen.').matches('fen.x')).toBe(false);
    expect(list('fen.').matches('fen. next')).toBe(true);
    expect(list('wim-bel/7').matches('see wim-bel/7.')).toBe(true);
  });

  it('compiles every printable ASCII character without error', () => {
    for (let c = 33; c < 127; c++) {
      expect(() => compileTerm(`x${String.fromCharCode(c)}y`)).not.toThrow();
    }
  });
});

describe('lines', () => {
  it('returns sorted, unique, 1-based line numbers', () => {
    const d = list('orb', 'fen');
    expect(d.lines('orb fen\nnone\nfen\norb')).toEqual([1, 3, 4]);
  });

  it('works with CRLF line endings', () => {
    expect(list('orb').lines('a\r\nb\r\norb')).toEqual([3]);
  });
});

describe('loadDenylist', () => {
  it('prefers the inline list over the file', () => {
    const d = loadDenylist(() => 'fen', { WIRELITH_DENYLIST: 'orb', WIRELITH_DENYLIST_FILE: '/x' });
    expect(d?.matches('orb')).toBe(true);
    expect(d?.matches('fen')).toBe(false);
  });

  it('reads the file when there is no inline list', () => {
    const d = loadDenylist(() => 'fen\n', { WIRELITH_DENYLIST_FILE: '/x' });
    expect(d?.matches('fen')).toBe(true);
  });

  it('returns null when neither is set', () => {
    expect(loadDenylist(() => '', {})).toBeNull();
  });
});
