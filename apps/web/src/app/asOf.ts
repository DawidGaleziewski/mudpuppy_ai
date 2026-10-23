// As of (spec 040 FR-001, designer 12-v2-ux § 2): the model pages (Processes, Screens and its map,
// Rules) as they were when a past model version was built. The choice lives in the page address
// (`?as_of=4`); the model pages' API reads the store as of then, and links between model pages
// keep it.

/** The console's model pages: they follow As of. */
const MODEL_PAGE = /^\/app\/portals\/[^/]+\/(processes|screens|rules)(\/|$|\?)/;
/** Their API: it is asked with the same `as_of`. */
const MODEL_API = /^\/api\/portals\/[^/]+\/(processes|screens|map|rules)(\/|$|\?)/;

export const isModelPage = (path: string) => MODEL_PAGE.test(path);

/** The version the address asks for; null: Now. */
export function currentAsOf(search: string = typeof window === 'undefined' ? '' : window.location.search): string | null {
  const v = new URLSearchParams(search).get('as_of');
  return v && /^\d+$/.test(v) ? v : null;
}

/** `href` with `as_of` added when it is a model page (or its API) and a version is chosen. */
export function withAsOf(href: string, asOf: string | null): string {
  if (!asOf || !(MODEL_PAGE.test(href) || MODEL_API.test(href)) || /[?&]as_of=/.test(href)) return href;
  const [path = '', hash] = href.split('#', 2);
  const joined = `${path}${path.includes('?') ? '&' : '?'}as_of=${asOf}`;
  return hash === undefined ? joined : `${joined}#${hash}`;
}
