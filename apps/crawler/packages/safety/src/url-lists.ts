/**
 * URL lists of a portal, a persona or a scan's focus (spec 023 US3): `allowed` (absent = every URL
 * inside the allowed domains) and `disallowed` (always wins). Pure.
 *
 * An entry is one of:
 * - a regex in slashes, `/\/polisa\/\d+/`: tested against the full URL; a slash-wrapped entry is
 *   a regex only when its body has a regex character (`\ ^ $ . + ? ( ) [ ] { } |`), so a path like
 *   `/konto/` stays a path;
 * - an absolute URL glob, `https://www.example.com/kontakt*`: against the full URL (no fragment);
 * - a path glob, `/konto/*` or `/szukaj?q=*`: against the path, and against path + query.
 * `*` matches any run of characters; matching is case-insensitive.
 */

import { urlEntryKind as entryKind } from '@mudpuppy/config';
import { globToRegExp } from './scope.js';
import type { Refusal } from './types.js';

export interface UrlLists {
  allowed?: readonly string[];
  disallowed?: readonly string[];
}

/** Whether `url` (absolute) matches the entry. An unusable entry matches nothing. */
export function matchUrlEntry(entry: string, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const full = parsed.href.split('#')[0]!;
  switch (entryKind(entry)) {
    case 'regex':
      try {
        return new RegExp(entry.slice(1, -1), 'i').test(full);
      } catch {
        return false;
      }
    case 'url':
      return globToRegExp(entry).test(full);
    case 'path': {
      const re = globToRegExp(entry);
      return re.test(parsed.pathname) || re.test(parsed.pathname + parsed.search);
    }
    default:
      return false;
  }
}

/**
 * The refusal for a URL the lists exclude, or null. `where` names the lists in the rule
 * (`urls` for the portal, `persona.urls`, `focus`): `urls.disallowed /admin/*`,
 * `urls.allowed (no entry matches)`.
 */
export function checkUrlLists(url: string, lists: UrlLists, where = 'urls'): Refusal | null {
  const denied = lists.disallowed?.find((e) => matchUrlEntry(e, url));
  if (denied !== undefined)
    return {
      status: 'out_of_scope',
      rule: `${where}.disallowed ${denied}`,
      reason: `excluded by rule ${denied}`,
    };
  if (lists.allowed !== undefined && !lists.allowed.some((e) => matchUrlEntry(e, url)))
    return {
      status: 'out_of_scope',
      rule: `${where}.allowed`,
      reason: `matches no ${where}.allowed entry`,
    };
  return null;
}
