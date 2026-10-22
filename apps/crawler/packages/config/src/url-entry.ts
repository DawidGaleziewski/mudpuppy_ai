/**
 * The kinds of URL list entry (spec 023 US3), shared by the config schema (which refuses an
 * unusable entry) and `@mudpuppy/safety` (which matches): a regex in slashes, an absolute URL
 * glob or a path glob. A slash-wrapped entry is a regex only when its body has a regex character
 * (`\ ^ $ . + ? ( ) [ ] { } |`), so a path like `/konto/` stays a path.
 */

export type UrlEntryKind = 'regex' | 'url' | 'path';

const REGEX_CHARS = /[\\^$.+?()[\]{}|]/;

export function urlEntryKind(entry: string): UrlEntryKind | null {
  if (entry.length > 2 && entry.startsWith('/') && entry.endsWith('/')) {
    if (REGEX_CHARS.test(entry.slice(1, -1))) return 'regex';
  }
  if (/^https?:\/\//i.test(entry)) return 'url';
  if (entry.startsWith('/')) return 'path';
  return null;
}

/** Why an entry cannot be used, or null when it is fine. */
export function urlEntryProblem(entry: string): string | null {
  const kind = urlEntryKind(entry);
  if (kind === null)
    return `${JSON.stringify(entry)} must be a path ("/…"), an absolute URL ("https://…") or a /regex/`;
  if (kind === 'regex') {
    try {
      new RegExp(entry.slice(1, -1), 'i');
    } catch (err) {
      return `${JSON.stringify(entry)} is not a valid regex: ${(err as Error).message}`;
    }
  }
  return null;
}
