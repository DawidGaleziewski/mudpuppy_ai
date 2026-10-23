// The data store (spec 019 US5, R-71 (d)): the main store of an environment, or an eval
// workspace's. The choice lives in the page address (`?store=eval:<workspace>:sandbox`); every
// page link and every API call keeps it, so the whole console reads that one store.

const KEY = /^(main|eval):[\w.:-]+$/;

/** The store the address asks for; null: the default one. */
export function currentStore(search: string = typeof window === 'undefined' ? '' : window.location.search): string | null {
  const v = new URLSearchParams(search).get('store');
  return v && KEY.test(v) ? v : null;
}

/** `href` with `store` added when it is an app page or the API and a store is chosen. */
export function withStore(href: string, store: string | null): string {
  const app = href === '/app' || href.startsWith('/app/') || href.startsWith('/api/');
  if (!store || !app || /[?&]store=/.test(href)) return href;
  const [path = '', hash] = href.split('#', 2);
  const joined = `${path}${path.includes('?') ? '&' : '?'}store=${encodeURIComponent(store)}`;
  return hash === undefined ? joined : `${joined}#${hash}`;
}
