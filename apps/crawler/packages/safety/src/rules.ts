import type { SafetyClass } from '@mudpuppy/core';

/**
 * Keywords and path patterns are data, not special-cased logic. Text is matched after
 * {@link normalize} (lower-case, diacritics stripped, `ł`→`l`), so patterns are written without
 * Polish diacritics or umlauts (`löschen` → `loschen`; `ß` stays). Locales: Polish, English and
 * German (spec 030 SC-05, field GC-14: a German "Senden" was read). Every locale is always on: a
 * keyword can only raise a class, so an extra language never makes a run less safe. Rule ids that
 * are denylist ids (see `BUILTIN_RULE_CLASSES` in `config`) can be listed in a portal's
 * `denylist`, as can their aliases (`RULE_ALIASES`).
 */
export interface ActionRule {
  id: string;
  safetyClass: SafetyClass;
  /** Matched against the normalized accessible name / text. */
  keywords: RegExp[];
  /** Matched against the normalized URL path (PL + EN). */
  paths: RegExp[];
  /** Where the rule comes from; built-in when absent (spec 002 config snapshot). */
  origin?: 'builtin' | 'portal' | 'builtin+portal';
}

export const ACTION_RULES: readonly ActionRule[] = [
  {
    id: 'logout',
    safetyClass: 'destructive',
    keywords: [
      /\bwyloguj/,
      /\bwylogowa/,
      /\blog ?out\b/,
      /\bsign ?out\b/,
      /\babmelden\b/,
      /\bausloggen\b/,
    ],
    paths: [/\/wyloguj/, /\/wylogowa/, /\/log-?out\b/, /\/sign-?out\b/, /\/abmelden\b/],
  },
  {
    id: 'delete',
    safetyClass: 'destructive',
    keywords: [
      /\busun/,
      /\busuw/,
      /\bkasuj/,
      /\bdelete\b/,
      /\bremove\b/,
      /\bloschen\b/,
      /\bloeschen\b/,
      /\bentfernen\b/,
      /\bstornieren\b/,
      /\bkundigen\b/,
    ],
    paths: [
      /\/usun/,
      /\/usuw/,
      /\/kasuj/,
      /\/delete\b/,
      /\/remove\b/,
      /\/lo(e)?schen\b/,
      /\/entfernen\b/,
    ],
  },
  {
    id: 'payment',
    safetyClass: 'external-side-effect',
    keywords: [
      /\bzaplac/,
      /\bplatnos/,
      /\bpay\b/,
      /\bpayment\b/,
      /\bcheckout\b/,
      /\bzamow/,
      /\bplace order\b/,
      /\bbezahlen\b/,
      /\bzahlungspflichtig/,
      /\bzur kasse\b/,
      /\bkostenpflichtig bestellen\b/,
    ],
    paths: [
      /\/platnos/,
      /\/zaplac/,
      /\/payment/,
      /\/checkout/,
      /\/zamowieni/,
      /\/pay\b/,
      /\/bezahlen\b/,
      /\/kasse\b/,
    ],
  },
  {
    // Generic (spec 002 FR-012): buy now, bid, order, buy a policy or ticket. Aliases: bidding, buy_now.
    id: 'purchase',
    safetyClass: 'external-side-effect',
    keywords: [
      /\blicytuj/,
      /\bzalicytuj/,
      /\bplace (a )?bid\b/,
      /\bbid\b/,
      /\bzaproponuj cene\b/,
      /\bmake (an )?offer\b/,
      /\bkup teraz\b/,
      /\bkup\b/,
      /\bkup polise\b/,
      /\bkup bilet\b/,
      /\bbuy now\b/,
      /\bbuy\b/,
      /\bbuy (a )?(policy|ticket)\b/,
      /\bjetzt kaufen\b/,
      /\bkaufen\b/,
      /\bbestellen\b/,
      /\babschlie(ss|ß)en\b/,
    ],
    paths: [/\/licytuj/, /\/licytacj/, /\/bid\b/, /\/kup-teraz/, /\/kup\b/, /\/buy-now/, /\/buy\b/],
  },
  {
    // Generic: send a message, contact form, ask a question. Alias: message_or_contact_seller.
    id: 'contact_or_message',
    safetyClass: 'external-side-effect',
    keywords: [
      /\bnapisz do sprzedawcy\b/,
      /\bnapisz wiadomosc\b/,
      /\bskontaktuj/,
      /\bcontact (the )?seller\b/,
      /\bmessage (the )?seller\b/,
      /\bwyslij\b/,
      /\bwyslij wiadomosc\b/,
      /\bsend\b/,
      /\bzadaj pytanie\b/,
      /\bsend (a )?message\b/,
      /\bask a question\b/,
      /\bsenden\b/,
      /\babsenden\b/,
      /\babschicken\b/,
      /\bverschicken\b/,
      /\bnachricht senden\b/,
    ],
    paths: [
      /\/wiadomosci\/nowa/,
      /\/messages\/new/,
      /\/napisz\b/,
      /\/kontakt-ze-sprzedawca/,
      /\/nachricht(en)?\/neu/,
    ],
  },
  {
    // Generic: show a phone number or address. Alias: reveal_seller_contact.
    id: 'reveal_contact',
    safetyClass: 'external-side-effect',
    keywords: [
      /\bpokaz (numer|telefon|kontakt)/,
      /\bshow (phone|number|contact)/,
      /\bzadzwon\b/,
      /\bcall (the )?seller\b/,
      /\bwyswietl numer\b/,
    ],
    paths: [/\/pokaz-numer/, /\/show-phone/, /\/reveal-contact/],
  },
  {
    // Generic: quote requests, applications, sign-ups, callbacks, newsletter sign-ups (spec 002).
    id: 'submit_request',
    safetyClass: 'external-side-effect',
    keywords: [
      /\bwyslij zapytanie\b/,
      /\bpopros o oferte\b/,
      /\bzamow rozmowe\b/,
      /\bzamow kontakt\b/,
      /\bzapisz sie\b/,
      /\baplikuj\b/,
      /\brequest a (quote|callback)\b/,
      /\bsign me up\b/,
      /\bsubscribe\b/,
      /\bapply (now|for)\b/,
      /\bbeantragen\b/,
      /\bantrag stellen\b/,
      /\banfrage senden\b/,
      /\bbestatigen\b/,
      /\bhochladen\b/,
      /\beinreichen\b/,
      /\bregistrieren\b/,
    ],
    paths: [/\/zapytanie\b/, /\/request-a-quote/, /\/newsletter\/(zapisz|subscribe)/],
  },
  {
    id: 'mutating:favourite',
    safetyClass: 'mutating',
    keywords: [
      /\bdodaj do ulubionych\b/,
      /\bulubion/,
      /\bfavou?rite/,
      /\bobserwuj/,
      /\bwatch\b/,
      /\bfollow\b/,
      /\bmerken\b/,
    ],
    paths: [],
  },
  {
    id: 'mutating:cart',
    safetyClass: 'mutating',
    keywords: [/\bdodaj do koszyka\b/, /\badd to (cart|basket)\b/, /\bin den warenkorb\b/],
    paths: [],
  },
  {
    id: 'mutating:save',
    safetyClass: 'mutating',
    keywords: [/\bzapisz\b/, /\bsave\b/, /\bzglos\b/, /\breport\b/, /\bspeichern\b/, /\bmelden\b/],
    paths: [],
  },
];

/**
 * Pager words: read only outside a form. A form's "Next" / "Dalej" submits the step it belongs to
 * (owner 2026-10-17, spec 032 F-10); a pager form is still read through its `paginate` purpose.
 */
export const PAGER_KEYWORDS: readonly RegExp[] = [
  /\bnastepn/,
  /\bpoprzedni/,
  /\bnext\b/,
  /\bprev(ious)?\b/,
];

/** Controls whose name marks a pure read/navigation interaction (used for buttons and other non-link roles). */
export const READ_KEYWORDS: readonly RegExp[] = [
  /\bszukaj/,
  /\bsearch\b/,
  /\bfiltr/,
  /\bfilter/,
  /\bsortuj/,
  /\bsort\b/,
  /\bzastosuj\b/,
  /\bapply\b/,
  /\bpokaz wiecej\b/,
  /\bwiecej\b/,
  /\bshow more\b/,
  /\bload more\b/,
  /\brozwin\b/,
  /\bzwin\b/,
  /\bexpand\b/,
  /\bcollapse\b/,
  /\bsuchen\b/,
  /\bsuche\b/,
  /\bfiltern\b/,
  /\bsortieren\b/,
  /\bmehr anzeigen\b/,
  /\bausklappen\b/,
  /\beinklappen\b/,
];

/** Roles that only change client-side state or navigate, never submit anything by themselves. */
export const READ_ROLES: ReadonlySet<string> = new Set([
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'listbox',
  'option',
  'tab',
  'tablist',
  'textbox',
]);

/** Roles that navigate when they carry an `href`. */
export const LINK_ROLES: ReadonlySet<string> = new Set(['link', 'menuitem', 'treeitem']);

const DIACRITICS = /[̀-ͯ]/g;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/\s+/g, ' ')
    .trim();
}
