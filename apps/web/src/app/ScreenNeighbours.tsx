import { useCallback } from 'react';
import { useLocation } from 'react-router';
import { Pager } from '../design-system';
import { screenFilter, useScreens } from './api-screens';
import { useGo } from './RouterAnchor';
import { useReviewKeys } from './useReviewKeys';

const screenAt = (portal: string, key: string, list: string) =>
  `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}?list=${encodeURIComponent(list)}`;

/**
 * "← Previous · n of N · Next →" over the Screens list this screen was opened from (R-71 (b),
 * R-103 (4), designer T-02): the same filter and order (`list=`, the list's own query, so its rows
 * come from the cache), passed on to the neighbours; J / K as on Review. A step replaces the
 * history entry, so Back returns to the list. Nothing when the screen was opened from elsewhere or
 * is no longer in that list.
 */
export function ScreenNeighbours({ portal, screenKey, list }: { portal: string; screenKey: string; list: string | null }) {
  const go = useGo();
  const kept = useLocation().state as unknown;
  const rows = useScreens(portal, screenFilter(new URLSearchParams(list ?? '')), list !== null).data?.screens;
  const all = rows ?? [];
  const i = all.findIndex((s) => s.key === screenKey);
  const at = (j: number) => {
    const s = list !== null && j >= 0 ? all[j] : undefined;
    return s ? { href: screenAt(portal, s.key, list ?? ''), title: s.title || s.key } : null;
  };
  const prev = at(i - 1);
  const next = at(i + 1);
  const move = useCallback(
    (step: 1 | -1) => {
      const to = step === 1 ? next : prev;
      // the page this screen came from stays with the neighbour (designer T-02)
      if (i >= 0 && to !== null) go(to.href, { replace: true, state: kept });
    },
    [go, i, next, prev, kept],
  );
  useReviewKeys({ move });
  if (list === null || i < 0) return null;
  return <Pager label="Screens in this list" position={i + 1} total={all.length} prev={prev} next={next} />;
}
