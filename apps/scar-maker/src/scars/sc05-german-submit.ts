// SC-05 (field GC-14): German controls that send, submit, save or delete. The built-in keywords were
// Polish and English only, so a read-only persona clicked "Senden" and posted a form.

import { html, page } from '../page.js';
import type { Scar } from '../types.js';

const sent =
  (what: string): Scar['routes'][string] =>
  (_req, res, ctx) => {
    ctx.memory.set('sc05:sent', ((ctx.memory.get('sc05:sent') as number | undefined) ?? 0) + 1);
    html(res, page(what, `<p>${what}: done.</p>`, '', 'de'));
  };

export const sc05: Scar = {
  id: 'SC-05',
  entry: '/sc05/',
  routes: {
    '/sc05/': (_req, res) =>
      html(
        res,
        page(
          'Postfach',
          `<p><a href="/sc05/uebersicht">Übersicht</a></p>
<p><a href="/sc05/nachricht?aktion=senden">Senden</a>
<a href="/sc05/antrag?aktion=absenden">Antrag absenden</a>
<a href="/sc05/eintrag?aktion=loeschen">Löschen</a></p>
<form method="get" action="/sc05/profil">
<label for="n">Name</label><input id="n" name="name">
<button type="submit">Speichern</button>
</form>`,
          '',
          'de',
        ),
      ),
    '/sc05/uebersicht': (_req, res) =>
      html(res, page('Übersicht', '<p>Alle Nachrichten.</p><a href="/sc05/">Zurück</a>', '', 'de')),
    '/sc05/nachricht': sent('Nachricht gesendet'),
    '/sc05/antrag': sent('Antrag abgesendet'),
    '/sc05/eintrag': sent('Eintrag gelöscht'),
    '/sc05/profil': sent('Profil gespeichert'),
    // How many sends happened: the gate checks that a read-only run caused none.
    '/__admin/sc05/sent': (_req, res, ctx) =>
      html(res, String((ctx.memory.get('sc05:sent') as number | undefined) ?? 0)),
  },
};
