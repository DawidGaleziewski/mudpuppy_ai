import { useLocation } from 'react-router';
import { Disclosure, Row, Rows, Text } from '../design-system';
import { usePortals } from './api';
import { currentAsOf, isModelPage } from './asOf';

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
 * The header's portal picker (designer FE-N01, FE-N02; R-103 (3)): the portal this page is in,
 * and a menu of links to the others (the section kept), All portals and + New portal. A menu of
 * links, never a select that navigates.
 */
export function PortalMenu({ portal }: { portal: string | undefined }) {
  const { pathname, search } = useLocation();
  const portals = usePortals().data?.portals ?? [];
  return (
    <Disclosure summary={`Portal: ${portal ?? 'All portals'}`}>
      <Rows label="Switch portal">
        {portals.map((p) => (
          <Row key={p.id} current={p.id === portal}>
            <Text href={switchHref(pathname, search, p.id)}>{p.id}</Text>
          </Row>
        ))}
        <Row current={portal === undefined && pathname.replace(/\/$/, '') === '/app'}>
          <Text href="/app/">All portals</Text>
        </Row>
        <Row>
          <Text href="/app/portals/new">+ New portal</Text>
        </Row>
      </Rows>
    </Disclosure>
  );
}
