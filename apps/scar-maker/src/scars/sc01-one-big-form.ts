// SC-01 (field C-2): a legacy server-rendered page wraps everything in one `<form method="post">`.
// Its navigation tiles are anchors without an href whose click handler opens the page: role-less, so
// only the clickable scan finds them, and inside the form, so they used to inherit its POST.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

const tiles = [
  ['/sc01/vertraege', 'Verträge'],
  ['/sc01/dokumente', 'Dokumente'],
  ['/sc01/postfach', 'Postfach'],
] as const;

/** The page-wide form of the legacy stack, with its hidden server-state field. */
const bigForm = (inner: string): string => `<form method="post" action="/sc01/" name="mainForm">
<input type="hidden" name="__SERVERSTATE" value="opaque-server-state">
${inner}
<button type="submit">Aktualisieren</button>
</form>`;

const nav = `<nav>
${tiles
  .map(
    ([href, label]) =>
      `<a class="tile" style="cursor:pointer" onclick="location.href='${href}'">${label}</a>`,
  )
  .join('\n')}
<a href="/sc01/hilfe">Hilfe</a>
</nav>`;

const leaf =
  (label: string): Scar['routes'][string] =>
  (_req, res) =>
    html(
      res,
      page(label, bigForm(`<p>Seite ${label}.</p><a href="/sc01/">Zur Übersicht</a>`), '', 'de'),
    );

export const sc01: Scar = {
  id: 'SC-01',
  entry: '/sc01/',
  routes: {
    '/sc01/': (req, res) =>
      html(
        res,
        page(
          req.method === 'POST' ? 'Übersicht (aktualisiert)' : 'Übersicht',
          bigForm(nav),
          '',
          'de',
        ),
      ),
    '/sc01/hilfe': leaf('Hilfe'),
    ...Object.fromEntries(tiles.map(([href, label]) => [href, leaf(label)])),
  },
};
