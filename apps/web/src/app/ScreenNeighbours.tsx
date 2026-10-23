import { useCallback } from 'react';
import { Cluster, LinkButton, Text } from '../design-system';
import { screenFilter, useScreens } from './api-screens';
import { useGo } from './RouterAnchor';
import { useReviewKeys } from './useReviewKeys';

const screenAt = (portal: string, key: string, list: string) =>
  `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}?list=${encodeURIComponent(list)}`;

/**
 * ← Prev · n of N · Next → over the Screens list this screen was opened from (R-71 (b), R-103
 * (4)): the same filter and order (`list=`, the list's own query, so its rows come from the
 * cache), passed on to the neighbours; J / K as on Review and Before / after. Nothing when the
 * screen was opened from elsewhere or is no longer in that list.
 */
export function ScreenNeighbours({ portal, screenKey, list }: { portal: string; screenKey: string; list: string | null }) {
  const go = useGo();
  const rows = useScreens(portal, screenFilter(new URLSearchParams(list ?? '')), list !== null).data?.screens;
  const keys = rows?.map((s) => s.key) ?? [];
  const i = keys.indexOf(screenKey);
  const at = (j: number) => (list !== null && j >= 0 && j < keys.length ? screenAt(portal, keys[j] ?? '', list) : null);
  const prev = at(i - 1);
  const next = at(i + 1);
  const move = useCallback(
    (step: 1 | -1) => {
      const to = step === 1 ? next : prev;
      if (i >= 0 && to !== null) go(to);
    },
    [go, i, next, prev],
  );
  useReviewKeys({ move });
  if (list === null || i < 0) return null;
  return (
    <Cluster>
      {prev !== null && (
        <LinkButton size="md" href={prev} aria-keyshortcuts="K">
          ← Prev
        </LinkButton>
      )}
      <Text small muted>{`${String(i + 1)} of ${String(keys.length)}`}</Text>
      {next !== null && (
        <LinkButton size="md" href={next} aria-keyshortcuts="J">
          Next →
        </LinkButton>
      )}
    </Cluster>
  );
}
