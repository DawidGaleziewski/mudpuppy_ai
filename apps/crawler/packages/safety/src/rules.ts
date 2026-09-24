import type { SafetyClass } from '@pathfinder/core';

/**
 * Keywords and path patterns are data, not special-cased logic. Text is matched after
 * {@link normalize} (lower-case, diacritics stripped, `ł`→`l`), so patterns are written without
 * Polish diacritics. Rule ids that are denylist ids (see `BUILTIN_RULE_CLASSES` in `config`) can be
 * listed in a portal's `denylist`, as can their aliases (`RULE_ALIASES`).
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
    keywords: [/\bwyloguj/, /\bwylogowa/, /\blog ?out\b/, /\bsign ?out\b/],
    paths: [/\/wyloguj/, /\/wylogowa/, /\/log-?out\b/, /\/sign-?out\b/],
  },
  {
    id: 'delete',
    safetyClass: 'destructive',
    keywords: [/\busun/, /\busuw/, /\bkasuj/, /\bdelete\b/, /\bremove\b/],
    paths: [/\/usun/, /\/usuw/, /\/kasuj/, /\/delete\b/, /\/remove\b/],
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
    ],
    paths: [/\/platnos/, /\/zaplac/, /\/payment/, /\/checkout/, /\/zamowieni/, /\/pay\b/],
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
    ],
    paths: [/\/wiadomosci\/nowa/, /\/messages\/new/, /\/napisz\b/, /\/kontakt-ze-sprzedawca/],
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
    ],
    paths: [],
  },
  {
    id: 'mutating:cart',
    safetyClass: 'mutating',
    keywords: [/\bdodaj do koszyka\b/, /\badd to (cart|basket)\b/],
    paths: [],
  },
  {
    id: 'mutating:save',
    safetyClass: 'mutating',
    keywords: [/\bzapisz\b/, /\bsave\b/, /\bzglos\b/, /\breport\b/],
    paths: [],
  },
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
  /\bnastepn/,
  /\bpoprzedni/,
  /\bnext\b/,
  /\bprev(ious)?\b/,
  /\bpokaz wiecej\b/,
  /\bwiecej\b/,
  /\bshow more\b/,
  /\bload more\b/,
  /\brozwin\b/,
  /\bzwin\b/,
  /\bexpand\b/,
  /\bcollapse\b/,
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
