// Back to the list as it was left (R-103 (7)): the query each page of the app last had (a list's
// filter, order and page), so a crumb up to it (`rel="up"`) opens it the same way. In memory: a
// reload starts from the plain list. The data store and As of are the router link's own business.

const KEPT_OUT = ['store', 'as_of'];
const last = new Map<string, string>();

/** Remember the query a page was shown with (called on every move inside the app). */
export function rememberAddress(pathname: string, search: string): void {
  const p = new URLSearchParams(search);
  for (const k of KEPT_OUT) p.delete(k);
  const q = p.toString();
  if (q) last.set(pathname, q);
  else last.delete(pathname);
}

/** `href` with the query its page last had, when it names a page without a query of its own. */
export function asLeft(href: string): string {
  if (href.includes('?') || href.includes('#')) return href;
  const q = last.get(href) ?? last.get(href.replace(/\/$/, ''));
  return q ? `${href}?${q}` : href;
}
