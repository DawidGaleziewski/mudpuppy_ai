// Came from (designer T-01, D-65, FE-V31): an in-app link carries the page it was clicked on, so
// the next page's head can offer "← {Kind} {title}" one step back to the exact address. Kept in
// the history entry's state (it survives a reload, not a copied address: intended).

import { useMemo } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router';
import type { PageHeadWiring } from '../design-system';

/** What a link carries: the address left, its kind and title, and its history entry's index. */
export interface From {
  href: string;
  kind: string;
  title: string;
  idx?: number;
}

/** The title the shown page's head reports (its `h1` text at the click; never fetched again). */
let shownTitle = '';

/** Each kind of page by its address under a portal (or a scan); a list by its section's name. */
const KINDS: readonly (readonly [RegExp, string])[] = [
  [/^\/app\/scans\/[^/]+/, 'Scan'],
  [/\/processes\/loose$/, 'In no process'],
  [/\/processes\/[^/]+/, 'Process'],
  [/\/screens\/(map|recorded|access)$/, 'Screens'],
  [/\/screens\/[^/]+/, 'Screen'],
  [/\/rules\/[^/]+/, 'Rule'],
  [/\/changes\/[^/]+/, 'Change'],
  [/\/docs\/sessions\/[^/]+/, 'Session'],
  [/\/docs\/[^/]+/, 'Record'],
  [/\/review$/, 'Review'],
  [/\/changes$/, 'Changes'],
  [/\/processes$/, 'Processes'],
  [/\/screens$/, 'Screens'],
  [/\/rules$/, 'Rules'],
  [/\/docs$/, 'Docs'],
  [/\/scans$/, 'Scans'],
  [/\/settings$/, 'Settings'],
  [/\/same-screen$/, 'Same screen?'],
];

/** The kind a page's address names ("Process", "Screen", "Review"); "Page" when none fits. */
export function kindOf(pathname: string): string {
  const path = pathname.replace(/\/$/, '');
  return KINDS.find(([re]) => re.test(path))?.[1] ?? 'Page';
}

function historyIdx(): number | undefined {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' ? idx : undefined;
}

/** The page being left, as a link carries it. */
export function fromHere(at: Pick<Location, 'pathname' | 'search' | 'hash'>): From {
  const idx = historyIdx();
  return { href: `${at.pathname}${at.search}${at.hash}`, kind: kindOf(at.pathname), title: shownTitle || kindOf(at.pathname), ...(idx !== undefined && { idx }) };
}

/** The `from` a history entry holds, if it is one. */
export function fromOf(state: unknown): From | null {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'object' || from === null) return null;
  const { href, kind, title } = from as Record<string, unknown>;
  return typeof href === 'string' && typeof kind === 'string' && typeof title === 'string' ? (from as From) : null;
}

const pathOf = (href: string) => href.split(/[?#]/)[0]?.replace(/\/$/, '') ?? '';

/**
 * The page heads' wiring: a came-from link when the page was opened from another one that its
 * crumbs don't lead back to; when a crumb does (its own list), that crumb takes the address left,
 * with its filter and page. Back goes back in history when the previous entry is that page.
 */
export function useCameFromWiring(): PageHeadWiring {
  const location = useLocation();
  const navigate = useNavigate();
  const from = fromOf(location.state);
  return useMemo<PageHeadWiring>(
    () => ({
      title: (text) => {
        shownTitle = text;
      },
      cameFrom: (crumbs) => {
        if (from === null || pathOf(from.href) === pathOf(location.pathname)) return { back: null };
        const index = crumbs.findIndex((c) => c !== '' && pathOf(c) === pathOf(from.href));
        if (index >= 0) return { back: null, crumb: { index, href: from.href } };
        const onBack = () => {
          const idx = historyIdx();
          if (from.idx !== undefined && idx === from.idx + 1) void navigate(-1);
          else void navigate(from.href);
        };
        return { back: { href: from.href, kind: from.kind, title: from.title, onBack } };
      },
    }),
    [from, location.pathname, navigate],
  );
}
