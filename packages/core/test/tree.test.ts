// SPDX-License-Identifier: MIT

// The syntax tree (spec section 13) and the outline (section 13.2).

import { describe, expect, it } from 'vitest';
import { outline, parse } from '../src/index.js';

describe('parse', () => {
  it('builds the tree in schema member order', () => {
    const src = [
      'wirelith 0.1',
      'theme "fernway" extends=paper',
      '  color.primary #1F6F5C',
      '  radius 10',
      '',
      'screen "Sign in" phone #signin // a comment',
      '  input "Email" type=email placeholder="you@example.com" required',
      '  select [1, 2, "a, b"] value=1',
      '  note "Check" for=#go',
      '  button "Go" primary #go -> #home "Signs in"',
      'screen "Home" #home',
      'flow #home -> #signin "Back"',
      '',
    ].join('\n');
    const { tree, diagnostics } = parse(src);
    expect(diagnostics).toEqual([]);
    expect(JSON.parse(JSON.stringify(tree))).toEqual({
      type: 'document',
      version: '0.1',
      theme: {
        name: 'fernway',
        extends: 'paper',
        tokens: { 'color.primary': '#1F6F5C', radius: 10 },
        loc: { line: 2, column: 1 },
      },
      screens: [
        {
          type: 'screen',
          id: 'signin',
          label: 'Sign in',
          flags: ['phone'],
          children: [
            {
              type: 'input',
              label: 'Email',
              flags: ['required'],
              attrs: { type: 'email', placeholder: 'you@example.com' },
              loc: { line: 7, column: 3 },
            },
            { type: 'select', items: ['1', '2', 'a, b'], attrs: { value: 1 }, loc: { line: 8, column: 3 } },
            { type: 'note', label: 'Check', attrs: { for: { ref: 'go' } }, loc: { line: 9, column: 3 } },
            {
              type: 'button',
              id: 'go',
              label: 'Go',
              flags: ['primary'],
              link: { to: 'home', label: 'Signs in' },
              loc: { line: 10, column: 3 },
            },
          ],
          loc: { line: 6, column: 1 },
        },
        { type: 'screen', id: 'home', label: 'Home', loc: { line: 11, column: 1 } },
      ],
      flows: [{ from: 'home', to: 'signin', label: 'Back', loc: { line: 12, column: 1 } }],
    });
    // Member order as in the schema.
    expect(Object.keys(tree.screens[0] ?? {})).toEqual(['type', 'id', 'label', 'flags', 'children', 'loc']);
  });

  it('reads escapes, numbers, ids in attributes and table rows', () => {
    const { tree } = parse(
      'screen "a \\"b\\" \\\\ c\\nd"\n  table [x]\n    row [y] selected\n  image ratio=16:9 width=-5\n',
    );
    const s = tree.screens[0];
    expect(s?.label).toBe('a "b" \\ c\nd');
    expect(s?.children?.[0]?.children?.[0]?.type).toBe('table-row');
    expect(s?.children?.[1]?.attrs).toEqual({ ratio: '16:9', width: -5 });
  });

  it('ignores a byte-order mark and CRLF line endings', () => {
    const a = parse('﻿screen "A"\r\n  text "x"\r\n').tree;
    const b = parse('screen "A"\n  text "x"\n').tree;
    expect(a).toEqual(b);
  });

  it('treats a theme block with no tokens as a block', () => {
    expect(parse('theme "copy" extends=ink\nscreen "A"\n').tree.theme).toEqual({
      name: 'copy',
      extends: 'ink',
      tokens: {},
      loc: { line: 1, column: 1 },
    });
    expect(parse('theme ink\n').tree.theme).toEqual({ name: 'ink', loc: { line: 1, column: 1 } });
  });
});

describe('outline', () => {
  it('lists screens, overlays and links', () => {
    const src = [
      'screen "Sign in" phone #signin',
      '  button "Go" #go -> #home "Signs in"',
      '  link "Help" -> #help',
      '  modal "Help" #help',
      '    text "Hi"',
      'screen "Sign in" #signin-err of=#signin state="Wrong"',
      'screen "Home" size=500x600 #home',
      '  drawer open',
      'flow #home -> #signin',
      '',
    ].join('\n');
    const { outline: o, diagnostics } = outline(src);
    expect(diagnostics).toEqual([]);
    expect(o).toEqual({
      screens: [
        {
          id: 'signin',
          title: 'Sign in',
          device: { name: 'phone', width: 390, height: 844 },
          overlays: [{ id: 'help', type: 'modal', title: 'Help', open: false }],
        },
        {
          id: 'signin-err',
          title: 'Sign in',
          device: { name: 'phone', width: 390, height: 844 },
          of: 'signin',
          state: 'Wrong',
          overlays: [],
        },
        {
          id: 'home',
          title: 'Home',
          device: { name: 'custom', width: 500, height: 600 },
          overlays: [{ id: 'n7', type: 'drawer', open: true }],
        },
      ],
      links: [
        {
          kind: 'element',
          from: { screen: 'signin', element: { id: 'go', index: 1, type: 'button', line: 2 } },
          to: 'home',
          label: 'Signs in',
        },
        {
          kind: 'element',
          from: { screen: 'signin', element: { index: 2, type: 'link', line: 3 } },
          to: 'help',
        },
        { kind: 'flow', from: { screen: 'home' }, to: 'signin' },
      ],
    });
  });

  it('is null for a source with errors', () => {
    expect(outline('screen "A"\n  textfield\n').outline).toBeNull();
  });
});
