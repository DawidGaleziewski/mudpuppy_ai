// What changed and Before / after (`web/api_changes.py` over `queries_app_changes.py` and
// `queries_app_change.py`), typed as the pydantic models declare them. Read-only: a change's
// hypothesis is decided through Review's decide write (`reviewWrites.decide`).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type ChipOut, type StatusOut } from './api';
import type { Option } from './api-review';

export interface ChangeRow {
  id: string;
  kind: string;
  word: ChipOut;
  finding: string;
  explanation: ChipOut;
  explanation_text: string;
  /** The hypothesis's latest reason, while the change still needs someone. */
  reason: string | null;
  status: StatusOut;
  hypothesis_key: string | null;
  model_seq: number;
  at: string;
  element_key: string | null;
}

export interface ChangeScreenGroup {
  key: string | null;
  title: string;
  route: string | null;
  count: number;
  needs: number;
  changes: ChangeRow[];
}

export interface ChangeProcessGroup {
  /** PRC-nnn; null: Not in a process. */
  key: string | null;
  name: string;
  count: number;
  needs: number;
  screens: ChangeScreenGroup[];
}

export interface ChangesRange {
  how: 'release' | 'version' | 'first' | 'date' | 'scan';
  from_seq: number;
  to_seq: number | null;
  from_date: string;
  from_scan: string;
  froms: Option[];
  tos: Option[];
  scans: Option[];
}

export interface ChangesReleases {
  lanes: {
    name: string;
    scope: string;
    spans: { name: string; left: number; width: number; start: string; end: string; current: boolean; rollout: boolean; unknown: boolean; href: string }[];
  }[];
  scans: { id: string; left: number; at: string; status: string; check: boolean }[];
  axis: { left: number; label: string }[];
  start: string;
  end: string;
  range_left: number | null;
  range_width: number | null;
  range_label: string;
}

export interface ChangesPage {
  portal: string;
  has_model: boolean;
  counts: { all: number; needs: number; explained: number; waiting: number };
  show: 'all' | 'needs' | 'explained';
  kind: string | null;
  process: string | null;
  kinds: Option[];
  processes: Option[];
  range: ChangesRange | null;
  releases: ChangesReleases | null;
  shown: number;
  groups: ChangeProcessGroup[];
  legend: { chip: ChipOut; text: string; count: number }[];
  /** Needs you, explained automatically, waiting for a check. */
  statuses: StatusOut[];
}

export interface ChangeSide {
  label: string;
  note: string;
  state_id: string | null;
  title: string | null;
  route: string | null;
  shot: string | null;
  wire: string | null;
  status: StatusOut | null;
  scan: string | null;
  at: string | null;
  has_change: boolean;
}

export interface ChangePage {
  portal: string;
  change: ChangeRow;
  screen_key: string | null;
  screen_title: string | null;
  screen_route: string | null;
  process: Option | null;
  before: ChangeSide;
  after: ChangeSide;
  region: { left: number; top: number; width: number; height: number } | null;
  differs: { label: string; before: string; after: string; differs: boolean }[];
  explained: boolean;
  hypothesis_status: StatusOut | null;
  rule: string | null;
  reason: string | null;
  tests: { inputs: string; result: string | null; verdict: StatusOut }[];
  decidable: boolean;
  rule_link: boolean;
  neighbours: { position: number; total: number; prev: string | null; next: string | null } | null;
  back: string;
}

/** The page's query, as its address keeps it. */
export interface ChangesView {
  from_seq?: string | undefined;
  to_seq?: string | undefined;
  from_date?: string | undefined;
  from_scan?: string | undefined;
  show?: string | undefined;
  kind?: string | undefined;
  process?: string | undefined;
}

export const changesQuery = (v: ChangesView): string => {
  const p = new URLSearchParams();
  for (const [k, value] of Object.entries(v)) if (value) p.set(k, value as string);
  if (p.get('show') === 'all') p.delete('show');
  const qs = p.toString();
  return qs ? `?${qs}` : '';
};

const base = (portal: string) => `/app/portals/${encodeURIComponent(portal)}/changes`;

export const changesHref = (portal: string, v: ChangesView = {}) => `${base(portal)}${changesQuery(v)}`;

export type CompareMode = 'side' | 'overlay' | 'wire';

export const changeHref = (portal: string, id: string, mode: CompareMode = 'side') =>
  `${base(portal)}/${encodeURIComponent(id)}${mode === 'side' ? '' : `?mode=${mode}`}`;

export const changesKey = (portal: string) => ['portals', portal, 'changes'] as const;

export const useChanges = (portal: string, v: ChangesView) =>
  useQuery({
    queryKey: [...changesKey(portal), v],
    queryFn: () => getJson<ChangesPage>(`/api/portals/${encodeURIComponent(portal)}/changes${changesQuery(v)}`),
    placeholderData: keepPreviousData,
  });

export const useChange = (portal: string, id: string) =>
  useQuery({
    queryKey: [...changesKey(portal), 'one', id],
    queryFn: () => getJson<ChangePage>(`/api/portals/${encodeURIComponent(portal)}/changes/${encodeURIComponent(id)}`),
  });
