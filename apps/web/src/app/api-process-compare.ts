// A process's Compare and History (`web/api_process.py` over `queries_app_process_compare.py`),
// typed as the pydantic models declare them.
import type { StatusOut } from './api';
import { api, read } from './state/api';
import type { Option } from './api-map';
import { processKey } from './api-process';

export interface CompareHead {
  portal: string;
  id: string;
  key: string;
  name: string;
  models: Option[];
}

export interface DiffRow {
  change: StatusOut;
  left: { title: string; route: string | null }[];
  right: { title: string; route: string | null } | null;
  notes: string[];
  merged: string | null;
}

export interface Compare {
  head: CompareHead;
  left: string;
  right: string | null;
  left_label: string;
  right_label: string;
  draft: boolean;
  counts: [StatusOut, number][];
  rows: DiffRow[];
  saved: string | null;
  spec_head: number | null;
  sections: { key: string; title: string; is_list: boolean; text: string }[];
  left_rev: number;
  right_rev: number | null;
}

export interface Revision {
  label: string;
  rev: number;
  change: string;
  author: string;
  at: string;
  note: string | null;
  live: string | null;
  latest: boolean;
  origin: string | null;
  restorable: boolean;
}

export interface History {
  head: CompareHead;
  revision_count: number;
  marked_in: string[];
  live: { environment: string; live: string | null; status: StatusOut; how: string | null; reason: string | null }[];
  models: { label: string; kind: string; rev: number; revisions: Revision[] }[];
  process: { rev: number; change: string; name: string; stage: StatusOut; author: string; at: string }[];
  specs: { rev: number; pair: string; left: string; right: string; author: string; at: string }[];
  conflicts: string[];
}

const base = (portal: string, key: string) =>
  `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(key)}`;

type CompareArg = { portal: string; key: string; left: string; right: string };
type ProcessArg = { portal: string; key: string };

const compareApi = api.injectEndpoints({
  endpoints: (b) => ({
    compare: read<Compare, CompareArg>(
      b,
      ({ portal, key, left, right }) => `${base(portal, key)}/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`,
      ({ portal, key, left, right }) => [...processKey(portal, key), 'compare', left, right],
    ),
    history: read<History, ProcessArg>(b, ({ portal, key }) => `${base(portal, key)}/history`, ({ portal, key }) => [...processKey(portal, key), 'history']),
  }),
});

export const useCompare = (portal: string, key: string, left: string, right: string) => compareApi.useCompareQuery({ portal, key, left, right });

export const useHistory = (portal: string, key: string) => compareApi.useHistoryQuery({ portal, key });

/** A process's own pages in the console: Compare and History. */
export const processPageHref = (portal: string, key: string, page: 'compare' | 'history', query = '') =>
  `/app/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(key)}/${page}${query}`;
