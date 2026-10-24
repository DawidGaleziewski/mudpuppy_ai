import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { usePortals } from './api';
import { useGo } from './RouterAnchor';

const LAST_PORTAL_KEY = 'mudpuppy.portal.last';

/** The portal used last in this browser (a per-viewer convenience; storage may be missing). */
function storedPortal(): string | undefined {
  try {
    return localStorage.getItem(LAST_PORTAL_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the portal this page is in. */
export function useRememberPortal(portal: string | undefined) {
  useEffect(() => {
    if (portal === undefined) return;
    try {
      localStorage.setItem(LAST_PORTAL_KEY, portal);
    } catch {
      // nothing to keep it in: the next visit opens by the portal count
    }
  }, [portal]);
}

/**
 * Where a visit that starts at `/app/` opens (designer T-12, D-77): the portal used last if the
 * store still lists it; else the only portal; none → New portal; several → All portals (null).
 */
export function firstVisitTarget(portals: readonly string[], last: string | undefined): string | null {
  if (last !== undefined && portals.includes(last)) return `/app/portals/${encodeURIComponent(last)}`;
  if (portals.length === 1) return `/app/portals/${encodeURIComponent(portals[0] ?? '')}`;
  if (portals.length === 0) return '/app/portals/new';
  return null;
}

/**
 * On the visit's first page only (an address typed or opened, not a click inside the app: React
 * Router's first entry has the key `default`), All portals moves on to `firstVisitTarget`.
 */
export function useFirstVisit() {
  const { key, search } = useLocation();
  const go = useGo();
  const portals = usePortals().data?.portals;
  useEffect(() => {
    if (key !== 'default' || portals === undefined) return;
    const to = firstVisitTarget(
      portals.map((p) => p.id),
      storedPortal(),
    );
    if (to !== null) go(`${to}${search}`, { replace: true });
  }, [key, portals, search, go]);
}
