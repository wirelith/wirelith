// SPDX-License-Identifier: MIT

/**
 * @wirelith/core: the parser, validator, layout engine and SVG renderer for Wirelith, a
 * plain-text language for low-fidelity wireframes.
 *
 * Every function is pure and synchronous. Core reads no files, makes no network requests,
 * uses no DOM and has no dependencies.
 */

export {
  extractSource,
  type LaidOutElement,
  type LayoutResult,
  layout,
  outline,
  parse,
  type RenderResult,
  render,
  SPEC_VERSION,
  SPECIMEN_SOURCE,
  validate,
} from './api.js';
export { format } from './format.js';
export type {
  Diagnostic,
  Document,
  Flow,
  HostTheme,
  Link,
  Loc,
  Node,
  Options,
  Outline,
  OutlineLink,
  OutlineScreen,
  Severity,
  ThemeDecl,
  Value,
} from './types.js';
