// Transient error pages (spec 030 FR-043, scar SC-17, owner 2026-10-15): a portal that answers now
// and then with a 503, a 500 error page, or a 200 page that only says a technical error happened.
// Such a page must be retried before it is observed, so it never becomes a screen in place of the
// real one. Pure: the caller reads the main document's status and the page text.

export type TransientKind = 'http_5xx' | 'soft_error';

/**
 * Phrases of a page that only reports a passing failure (EN, DE, PL), matched lower-case. A long
 * page that merely mentions one (an FAQ about outages) is not an error page: see {@link SOFT_MAX}.
 */
export const TRANSIENT_PHRASES: readonly string[] = [
  'temporarily unavailable',
  'service unavailable',
  'try again later',
  'technical error',
  'an unexpected error occurred',
  'vorübergehend nicht verfügbar',
  'technischer fehler',
  'versuchen sie es später',
  'chwilowo niedostępn',
  'błąd techniczny',
  'spróbuj ponownie później',
];

/** A soft error page is short: its whole visible text stays under this many characters. */
export const SOFT_MAX = 600;

export interface PageHealth {
  /** HTTP status of the main document, when the browser knows it (0 or undefined = unknown). */
  status?: number;
  /** The page's visible text. */
  text: string;
}

/** The kind of transient error the page shows, or null for a normal page. */
export function transientError(
  page: PageHealth,
  extraPhrases: readonly string[] = [],
): TransientKind | null {
  // 501 (not implemented) and 505 are answers about the request, not passing failures.
  if (page.status !== undefined && [500, 502, 503, 504].includes(page.status)) return 'http_5xx';
  const text = page.text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (text.length === 0 || text.length > SOFT_MAX) return null;
  const phrases = [...TRANSIENT_PHRASES, ...extraPhrases.map((p) => p.toLowerCase())];
  return phrases.some((p) => text.includes(p)) ? 'soft_error' : null;
}
