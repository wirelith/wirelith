// SPDX-License-Identifier: MIT

// Every diagnostic code in spec section 15, with its line and column.

import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/** code@line:column for each diagnostic. */
const at = (src: string, opts = {}) => validate(src, opts).map((d) => `${d.code}@${d.line}:${d.column}`);

describe('diagnostics', () => {
  const cases: [string, string, string[]][] = [
    ['E101 odd indentation', 'screen "A"\n   text "x"\n', ['E101@2:1']],
    ['E101 too deep', 'screen "A"\n    text "x"\n', ['E101@2:5']],
    ['E102 tab', 'screen "A"\n\ttext "x"\n', ['E102@2:1']],
    ['E103 newer major', 'wirelith 2.0\nscreen "A"\n', ['E103@1:10']],
    ['E104 open string', 'screen "A\n', ['E104@1:8']],
    ['E104 open list', 'screen "A"\n  list [a, b\n', ['E104@2:8']],
    ['E105 top level', 'button "x"\n', ['E105@1:1']],
    ['E105 late header', 'screen "A"\nwirelith 0.1\n', ['E105@2:1']],
    ['E106 bad escape', 'screen "a\\tb"\n', ['E106@1:10']],
    ['E106 empty value', 'screen "A"\n  text "x" align=\n', ['E106@2:18']],
    ['E106 empty item', 'screen "A"\n  list [a,,b]\n', ['E106@2:11']],
    ['E106 two labels', 'screen "A" "B"\n', ['E106@1:12']],
    ['E106 after link', 'screen "A" #a\n  button "x" -> #a "y" primary\n', ['E106@2:24']],
    ['E201 unknown with hint', 'screen "A"\n  textfield "x"\n', ['E201@2:3']],
    ['E203 modal in a row', 'screen "A"\n  row\n    modal "M"\n', ['E203@3:5']],
    ['E203 second header', 'screen "A"\n  header\n  header\n', ['E203@3:3']],
    ['E204 children of a leaf', 'screen "A"\n  button "x"\n    text "y"\n', ['E204@3:5']],
    ['E301 duplicate id', 'screen "A" #a\n  text "x" #a\n', ['E301@2:3']],
    ['E401 unknown target', 'screen "A" #a\n  button "x" -> #b\n', ['E401@2:3']],
    ['E401 wrong kind', 'screen "A" #a\n  text "t" #t\n  button "x" -> #t\n', ['E401@3:3']],
    ['E401 variant of a variant', 'screen "A" #a\nscreen "B" #b of=#a\nscreen "C" #c of=#b\n', ['E401@3:1']],
    [
      'E402 overlay in another screen',
      'screen "A" #a\n  modal "M" #m\nscreen "B" #b\n  button "x" -> #m\n',
      ['W403@3:1', 'E402@4:3'],
    ],
    ['E501 two themes', 'theme ink\ntheme paper\nscreen "A"\n', ['E501@2:1']],
    ['E506 extends itself', 'theme "x" extends=x\nscreen "A"\n', ['E506@1:1']],
    ['W101 newer minor', 'wirelith 0.3\nscreen "A"\n', ['W101@1:10']],
    ['W202 unknown flag', 'screen "A"\n  button "x" colour=red huge\n', ['W202@2:3']],
    ['W205 bad value', 'screen "A"\n  column gap=huge\n', ['W205@2:3']],
    ['W301 unknown icon', 'screen "A"\n  icon "person"\n', ['W301@2:3']],
    ['W302 active not listed', 'screen "A"\n  tabs [One, Two] active="Three"\n', ['W302@2:3']],
    ['W403 unreachable', 'screen "A" #a\n  button "x" -> #a\nscreen "B" #b\n', ['W403@3:1']],
    ['W502 unknown theme', 'theme fernway\nscreen "A"\n', ['W502@1:1']],
    ['W503 unknown token', 'theme "x"\n  shadow 4\nscreen "A"\n', ['W503@2:3']],
    ['W504 bad token value', 'theme "x"\n  radius 99\nscreen "A"\n', ['W504@2:3']],
    ['W505 low contrast', 'theme "x"\n  color.text #eeeeee\nscreen "A"\n', ['W505@1:1']],
    [
      'W601 row too wide',
      'screen "A" phone\n  row\n    button "A very long button label here"\n    button "Another very long button label"\n',
      ['W601@2:3'],
    ],
    ['W601 too many cells', 'screen "A"\n  table [a]\n    row [x, y]\n', ['W601@3:5']],
    [
      'W602 clipped word',
      'screen "A" size=200x400\n  h1 "Supercalifragilisticexpialidocious"\n',
      ['W602@2:3'],
    ],
  ];
  for (const [name, src, want] of cases) {
    it(name, () => {
      expect(at(src)).toEqual(want);
    });
  }

  it('E701 is reported alone', () => {
    expect(at(`screen "A"\n  text "${'x'.repeat(501)}"\n  textfield\n`)).toEqual(['E701@2:3']);
  });

  it('suggests the closest name', () => {
    const [d] = validate('screen "A"\n  textfield "x"\n');
    expect(d?.message).toContain('Did you mean "input"?');
    const [i] = validate('screen "A"\n  icon "serch"\n');
    expect(i?.message).toContain('"search"');
    const [l] = validate('screen "A" #dashboard\n  button "x" -> #dashbord\n');
    expect(l?.message).toContain('#dashboard');
  });

  it('reports host theme problems at line 1, or at the theme line', () => {
    const themes = { t: { tokens: { radius: 40 } } };
    expect(at('screen "A"\n', { themes, defaultTheme: 't' })).toEqual(['W504@1:1']);
    expect(at('\ntheme t\nscreen "A"\n', { themes })).toEqual(['W504@2:1']);
  });

  it('recovers and reports every error', () => {
    expect(
      at(
        'screen "A"\n  textfield\n  text "ok"\n  dropdown\n    text "child of a bad line"\n  button "x" -> #nope\n',
      ),
    ).toEqual(['E201@2:3', 'E201@4:3', 'E401@6:3']);
  });

  it('sorts by line, column and code', () => {
    const ds = validate('screen "A" #a\n  icon "nope" colour=red\n  button -> #b\n');
    expect(ds.map((d) => d.code)).toEqual(['W202', 'W301', 'E401']);
    expect(ds.map((d) => d.severity)).toEqual(['warning', 'warning', 'error']);
  });
});
