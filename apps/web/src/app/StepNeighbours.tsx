import { useCallback } from 'react';
import { useLocation } from 'react-router';
import { Pager } from '../design-system';
import { useProcessPage } from './api-process';
import { useProcesses } from './api-processes';
import { stateHref } from './api-state';
import { useGo } from './RouterAnchor';
import { useReviewKeys } from './useReviewKeys';

/**
 * Where a screen was opened from, besides the Screens list (designer T-02, spec 079 FR-007): a
 * process's steps (`in=process:PRC-001:A`) or Processes ▸ In no process (`in=loose`). The page's
 * address carries it, as `list=` does for the Screens list, so a reload keeps the pager.
 */
export const inProcess = (key: string, label: string) => `process:${key}:${label}`;
export const IN_LOOSE = 'loose';

/** A recorded screen's address that keeps the list it is in (`/app/states/{id}` redirects, keeping `in`). */
export const stateIn = (state: string, list: string) => `${stateHref(state)}?in=${encodeURIComponent(list)}`;

type Item = { state: string; title: string };

function useItems(portal: string, list: string): { items: Item[]; label: string } {
  const [kind, key = '', label = 'A'] = list.split(':');
  const process = useProcessPage(portal, key, label, '', kind === 'process' && key !== '').currentData;
  const loose = useProcesses(portal, false, 1, kind === IN_LOOSE).currentData;
  if (kind === 'process' && process) {
    const items = process.steps.flatMap((s) => (s.state ? [{ state: s.state, title: s.title }] : []));
    return { items, label: `Steps of ${process.key} ${label}` };
  }
  if (kind === IN_LOOSE && loose) return { items: loose.loose.map((s) => ({ state: s.state, title: s.title || s.route })), label: 'Screens in no process' };
  return { items: [], label: '' };
}

/** "← Previous · n of N · Next →" over that list; J / K; a step replaces the history entry. */
export function StepNeighbours({ portal, list, state }: { portal: string; list: string; state: string | null }) {
  const go = useGo();
  const kept = useLocation().state as unknown;
  const { items, label } = useItems(portal, list);
  const i = state === null ? -1 : items.findIndex((s) => s.state === state);
  const at = (j: number) => {
    const s = j >= 0 ? items[j] : undefined;
    return s ? { href: stateIn(s.state, list), title: s.title } : null;
  };
  const prev = at(i - 1);
  const next = at(i + 1);
  const move = useCallback(
    (step: 1 | -1) => {
      const to = step === 1 ? next : prev;
      if (i >= 0 && to !== null) go(to.href, { replace: true, state: kept });
    },
    [go, i, next, prev, kept],
  );
  useReviewKeys({ move });
  if (i < 0) return null;
  return <Pager label={label} position={i + 1} total={items.length} prev={prev} next={next} />;
}
