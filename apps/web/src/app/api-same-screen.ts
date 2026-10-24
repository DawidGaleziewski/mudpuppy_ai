// Same screen? (`web/api_same_screen.py` over `queries_app_same_screen.py`): one pair of page
// versions, typed as the pydantic models declare them, and the person's answer.
import type { ChangeSide } from './api-changes';
import { api, read } from './state/api';
import type { Write } from './state/http';

export interface PairLabel {
  answer: string;
  by: string;
  at: string;
  reason: string | null;
}

export interface PairVersion {
  state: string;
  screen_key: string | null;
  screen_title: string | null;
}

export interface Pair {
  a: PairVersion;
  b: PairVersion;
  sides: [ChangeSide, ChangeSide];
  similarity: number | null;
  model_answer: string;
  label: PairLabel | null;
  conflict: boolean;
  differs: { label: string; before: string; after: string }[];
  process: [string, string] | null;
  position: number;
  total: number;
  next_pair: [string, string] | null;
  earlier: PairLabel[];
}

export interface SameScreenView {
  page: {
    portal: string;
    screen: string | null;
    tau: number | null;
    window: number;
    answers: [string, string][];
    pair: Pair | null;
  };
  can_answer: boolean;
}

export interface PairPick {
  screen: string | null;
  a: string | null;
  b: string | null;
}

/** Same screen? in the console: the queue's first pair, or one pair (`a`, `b`), of one screen's queue. */
export const sameScreenHref = (portal: string, pick: Partial<PairPick> = {}) => {
  const q = new URLSearchParams();
  for (const k of ['screen', 'a', 'b'] as const) if (pick[k]) q.set(k, pick[k]);
  const query = q.toString();
  return `/app/portals/${encodeURIComponent(portal)}/same-screen${query ? `?${query}` : ''}`;
};

export const sameScreenKey = (portal: string) => ['portals', portal, 'same-screen'] as const;

const sameScreenApi = api.injectEndpoints({
  endpoints: (b) => ({
    sameScreen: read<SameScreenView, { portal: string; query: string }>(
      b,
      ({ portal, query }) => `/api/portals/${encodeURIComponent(portal)}/same-screen${query ? `?${query}` : ''}`,
      ({ portal, query }) => [...sameScreenKey(portal), query],
    ),
  }),
});

export const useSameScreen = (portal: string, pick: PairPick) => {
  const q = new URLSearchParams();
  for (const k of ['screen', 'a', 'b'] as const) if (pick[k]) q.set(k, pick[k]);
  return sameScreenApi.useSameScreenQuery({ portal, query: q.toString() });
};

export const labelPair = (portal: string, a: string, b: string, answer: string, why: string): Write => ({
  path: `/api/portals/${encodeURIComponent(portal)}/same-screen/label`,
  body: { a, b, answer, why },
});
