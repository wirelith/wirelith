// SPDX-License-Identifier: MIT

// What each eval task asks for, as checks on the syntax tree of the model's answer. They are
// deliberately lenient: they look for the things the task names, not for exact wording or layout.
// Validity (no errors) is scored separately, by core's validate.

/** @typedef {import('@wirelith/core').Document} Document */
/** @typedef {import('@wirelith/core').Node} Node */

/** @param {Document} doc @returns {Node[]} */
export function nodes(doc) {
  /** @type {Node[]} */
  const out = [];
  /** @param {Node} n */
  const visit = (n) => {
    out.push(n);
    for (const c of n.children ?? []) visit(c);
  };
  for (const s of doc.screens) visit(s);
  return out;
}

/** A node and everything under it. @param {Node} n @returns {Node[]} */
export function within(n) {
  return [n, ...(n.children ?? []).flatMap(within)];
}

/** @param {Node} n @param {string} f */
const flag = (n, f) => n.flags?.includes(f) ?? false;
/** @param {unknown} v */
const lower = (v) => String(v ?? '').toLowerCase();

/** Small helpers over one answer. @param {Document} doc */
function helpers(doc) {
  const all = nodes(doc);
  const of = (/** @type {string} */ t) => all.filter((n) => n.type === t);
  const count = (/** @type {string} */ t) => of(t).length;
  const labels = (/** @type {string} */ t) => of(t).map((n) => lower(n.label));
  const hasLabel = (/** @type {string} */ t, /** @type {string} */ text) =>
    labels(t).some((l) => l.includes(text));
  const device = (/** @type {Node} */ s) =>
    flag(s, 'phone')
      ? 'phone'
      : flag(s, 'tablet')
        ? 'tablet'
        : typeof s.attrs?.size === 'string'
          ? 'custom'
          : 'desktop';
  const isVariant = (/** @type {Node} */ s) => typeof s.attrs?.of === 'object';
  const links = all.filter((n) => n.link).length + (doc.flows?.length ?? 0);
  const byId = new Map(all.filter((n) => n.id).map((n) => [n.id, n]));
  const target = (/** @type {Node} */ n) => (n.link ? byId.get(n.link.to) : undefined);
  const items = (/** @type {Node} */ n) => (n.items ?? []).map(lower);
  const fields = count('input') + count('textarea');
  return { all, of, count, labels, hasLabel, device, isVariant, links, target, items, fields };
}

/**
 * The requirements of each task: [description, check] pairs.
 * @type {Record<string, [string, (doc: Document) => boolean][]>}
 */
export const REQUIREMENTS = {
  A1: [
    ['a phone screen', (d) => d.screens.some((s) => helpers(d).device(s) === 'phone')],
    [
      'at least three fields, one of them a password',
      (d) =>
        helpers(d).fields >= 3 &&
        helpers(d)
          .of('input')
          .some((n) => n.attrs?.type === 'password'),
    ],
    ['a checkbox', (d) => helpers(d).count('checkbox') >= 1],
    ['a button', (d) => helpers(d).count('button') >= 1],
  ],
  A2: [
    ['a desktop screen', (d) => d.screens.some((s) => helpers(d).device(s) === 'desktop')],
    [
      'tabs for Profile, Security and Notifications',
      (d) =>
        helpers(d)
          .of('tabs')
          .some((t) =>
            ['profile', 'security', 'notifications'].every((x) => helpers(d).items(t).includes(x)),
          ),
    ],
    ['an avatar', (d) => helpers(d).count('avatar') >= 1],
    ['fields for name, email and bio', (d) => helpers(d).fields >= 3],
    ['a time zone dropdown', (d) => helpers(d).count('select') >= 1],
    [
      'Save and Cancel buttons',
      (d) => helpers(d).hasLabel('button', 'save') && helpers(d).hasLabel('button', 'cancel'),
    ],
  ],
  A3: [
    ['a sidebar', (d) => helpers(d).count('sidebar') >= 1],
    [
      'a search field',
      (d) =>
        helpers(d)
          .of('input')
          .some(
            (n) =>
              n.attrs?.type === 'search' ||
              lower(n.attrs?.placeholder).includes('search') ||
              lower(n.label).includes('search'),
          ),
    ],
    ['a Compose button', (d) => helpers(d).hasLabel('button', 'compose')],
    [
      'a table of messages with at least three columns',
      (d) =>
        helpers(d)
          .of('table')
          .some((t) => (t.items?.length ?? 0) >= 3),
    ],
    [
      'Previous and Next buttons',
      (d) => helpers(d).hasLabel('button', 'prev') && helpers(d).hasLabel('button', 'next'),
    ],
    [
      'a selected folder and an unread count',
      (d) => {
        const h = helpers(d);
        const selected =
          h.of('item').some((n) => flag(n, 'active')) ||
          h.of('nav').some((n) => n.attrs?.active !== undefined);
        const count = h.of('item').some((n) => n.attrs?.badge !== undefined) || h.count('badge') >= 1;
        return selected && count;
      },
    ],
  ],
  A4: [
    [
      'at least three phone screens',
      (d) => d.screens.filter((s) => helpers(d).device(s) === 'phone').length >= 3,
    ],
    [
      'buttons that move between screens',
      (d) =>
        helpers(d)
          .of('button')
          .filter((b) => helpers(d).target(b)?.type === 'screen').length >= 2,
    ],
    ['a variant of a screen', (d) => d.screens.some((s) => helpers(d).isVariant(s))],
    [
      'a field with an error',
      (d) =>
        helpers(d)
          .of('input')
          .some((n) => n.attrs?.error !== undefined),
    ],
  ],
  A5: [
    ['the dark theme', (d) => d.theme?.name === 'ink' || d.theme?.extends === 'ink'],
    [
      'a header with a search field',
      (d) => helpers(d).count('header') >= 1 && helpers(d).count('input') >= 1,
    ],
    [
      'a button with an icon',
      (d) =>
        helpers(d)
          .of('button')
          .some((b) => b.attrs?.icon !== undefined),
    ],
    [
      'task cards with a priority badge and an avatar',
      (d) =>
        helpers(d)
          .of('card')
          .filter(
            (c) => within(c).some((x) => x.type === 'badge') && within(c).some((x) => x.type === 'avatar'),
          ).length >= 3,
    ],
    [
      '"New task" opens a dialog',
      (d) =>
        helpers(d)
          .of('button')
          .some((b) => lower(b.label).includes('new task') && helpers(d).target(b)?.type === 'modal'),
    ],
    [
      'the dialog has fields, a dropdown and a priority choice',
      (d) =>
        helpers(d)
          .of('modal')
          .some((m) => {
            const inner = within(m);
            const selects = inner.filter((n) => n.type === 'select').length;
            const radios = inner.filter((n) => n.type === 'radio').length;
            // The assignee dropdown and the priority choice are two separate controls.
            return (
              inner.filter((n) => n.type === 'input' || n.type === 'textarea').length >= 2 &&
              selects >= 1 &&
              selects + radios >= 2
            );
          }),
    ],
    ['a card opens a side panel', (d) => helpers(d).all.some((n) => helpers(d).target(n)?.type === 'drawer')],
    ['two notes', (d) => helpers(d).count('note') >= 2],
  ],
  B1: [
    ['a phone screen', (d) => d.screens.some((s) => helpers(d).device(s) === 'phone')],
    ['at least four fields', (d) => helpers(d).fields >= 4],
    ['a Favourite switch', (d) => helpers(d).count('toggle') >= 1],
    ['a Save button', (d) => helpers(d).hasLabel('button', 'save')],
  ],
  B2: [
    ['a heading', (d) => ['h1', 'h2', 'h3'].some((t) => helpers(d).count(t) >= 1)],
    [
      'a monthly / yearly switch',
      (d) =>
        helpers(d).count('toggle') >= 1 ||
        helpers(d)
          .of('tabs')
          .some((t) =>
            helpers(d)
              .items(t)
              .some((x) => x.includes('month')),
          ),
    ],
    ['three plan cards', (d) => helpers(d).count('card') >= 3],
    ['features listed', (d) => helpers(d).count('list') >= 1 || helpers(d).count('item') >= 3],
    [
      'a highlighted plan',
      (d) =>
        helpers(d)
          .of('card')
          .some((c) =>
            within(c).some((n) => n.type === 'badge' || (n.type === 'button' && flag(n, 'primary'))),
          ),
    ],
  ],
  B3: [
    ['an "Invite user" button', (d) => helpers(d).hasLabel('button', 'invite')],
    [
      'a search field and two dropdowns',
      (d) => helpers(d).count('input') >= 1 && helpers(d).count('select') >= 2,
    ],
    [
      'a table of users with at least five columns',
      (d) =>
        helpers(d)
          .of('table')
          .some((t) => (t.items?.length ?? 0) >= 5),
    ],
    [
      'a variant for no matches',
      (d) => d.screens.some((s) => helpers(d).isVariant(s)) && helpers(d).count('empty') >= 1,
    ],
  ],
  B4: [
    [
      'at least three tablet screens',
      (d) => d.screens.filter((s) => helpers(d).device(s) === 'tablet').length >= 3,
    ],
    [
      'buttons forward and back',
      (d) =>
        helpers(d)
          .of('button')
          .filter((b) => helpers(d).target(b)?.type === 'screen').length >= 4,
    ],
    [
      '"Confirm booking" opens a dialog',
      (d) =>
        helpers(d)
          .of('button')
          .some((b) => lower(b.label).includes('confirm') && helpers(d).target(b)?.type === 'modal'),
    ],
    [
      'the dialog\'s "Done" returns to the first screen',
      (d) => {
        const first = d.screens[0]?.id;
        return helpers(d)
          .of('modal')
          .some((m) =>
            within(m).some(
              (n) => n.type === 'button' && lower(n.label).includes('done') && n.link?.to === first,
            ),
          );
      },
    ],
  ],
  B5: [
    ['the blue monochrome theme', (d) => d.theme?.name === 'blueprint' || d.theme?.extends === 'blueprint'],
    [
      'a sidebar and breadcrumbs',
      (d) => helpers(d).count('sidebar') >= 1 && helpers(d).count('breadcrumbs') >= 1,
    ],
    [
      'Upload and "New folder" buttons, and a search field',
      (d) =>
        helpers(d).hasLabel('button', 'upload') &&
        helpers(d).hasLabel('button', 'new folder') &&
        helpers(d).count('input') >= 1,
    ],
    [
      'a grid of file cards with pictures',
      (d) => helpers(d).count('grid') >= 1 && helpers(d).count('image') >= 2,
    ],
    [
      'a details panel with Download and Delete',
      (d) =>
        helpers(d)
          .of('drawer')
          .some((r) => {
            const inner = within(r);
            return (
              inner.some((n) => n.type === 'button' && lower(n.label).includes('download')) &&
              inner.some((n) => n.type === 'button' && lower(n.label).includes('delete'))
            );
          }),
    ],
    [
      'Delete opens a confirmation dialog',
      (d) =>
        helpers(d)
          .of('button')
          .some((b) => lower(b.label).includes('delete') && helpers(d).target(b)?.type === 'modal'),
    ],
    [
      'loading and failed versions, with a retry button',
      (d) =>
        helpers(d).count('loading') >= 1 &&
        helpers(d)
          .of('error')
          .some((e) => within(e).some((k) => k.type === 'button')),
    ],
    ['two notes', (d) => helpers(d).count('note') >= 2],
  ],
};
