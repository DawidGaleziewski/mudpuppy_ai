import { useLocation } from 'react-router';
import { HeaderPicker, Menu, type MenuEntry } from '../design-system';
import { usePortals } from './api';
import { currentAsOf, isModelPage } from './asOf';
import { StoreMenu } from './StoreMenu';

/** A portal's list pages below a section: a switch stays on them (they exist in every portal). */
const LIST_PAGES = new Set(['screens/map', 'screens/recorded', 'screens/access', 'scans/plan', 'scans/by-process', 'scans/activity']);

/** Pages of a pair or a choice, not a section: the switch opens their section's list. */
const OWN_LIST: Record<string, string> = { 'same-screen': 'screens' };

/** The page's place inside its portal ("processes/P-1", "screens/map"); a scan's page is in Scans. */
function pageIn(pathname: string): string {
  const inPortal = /^\/app\/portals\/(?!new(?:\/|$))[^/]+\/?(.*)$/.exec(pathname);
  if (inPortal) return (inPortal[1] ?? '').replace(/\/$/, '');
  if (pathname.startsWith('/app/scans/')) return 'scans';
  return '';
}

/**
 * Where portal `to` opens from this address (FE-N02: switching keeps the current section): the
 * same section, a list page as it is, a detail page (one record, screen, process or scan) its
 * section's list, anything else the portal's Home. A past model version belongs to the old portal,
 * so a model page opens at Now.
 */
export function switchHref(pathname: string, search: string, to: string): string {
  const base = `/app/portals/${encodeURIComponent(to)}`;
  const rest = pageIn(pathname);
  const [section = ''] = rest.split('/');
  const kept = LIST_PAGES.has(rest) ? rest : (OWN_LIST[section] ?? section);
  const href = kept ? `${base}/${kept}` : base;
  return currentAsOf(search) !== null && isModelPage(href) ? `${href}?as_of=now` : href;
}

/**
 * The header's portal picker (designer FE-N01, FE-N02, T-11; R-103 (3)): "Portal [portal ▾][store
 * ▾]", the store riding on the portal it follows. The portal menu links the others (the section
 * kept), All portals and + New portal: a menu of links, never a select that navigates.
 */
export function PortalMenu({ portal }: { portal: string | undefined }) {
  const { pathname, search } = useLocation();
  const portals = usePortals().data?.portals ?? [];
  const entries: MenuEntry[] = [
    ...portals.map((p) => ({ key: p.id, label: p.id, checked: p.id === portal, href: switchHref(pathname, search, p.id) })),
    { separator: true },
    { key: 'all', label: 'All portals', checked: portal === undefined && pathname.replace(/\/$/, '') === '/app', href: '/app/' },
    { key: 'new', label: '+ New portal', href: '/app/portals/new' },
  ];
  return (
    <HeaderPicker label="Portal" joined>
      <Menu look="select" label="Switch portal" button={portal ?? 'All portals'} buttonLabel={`Portal: ${portal ?? 'All portals'}`} entries={entries} />
      <StoreMenu portal={portal} />
    </HeaderPicker>
  );
}
