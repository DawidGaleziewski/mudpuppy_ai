// The Review page (`web/api_review.py` over `queries_app_review.py`), typed as the pydantic models
// declare them, and its writes: decide (confirm or reject), undo, a record's review.
import type { ChipOut as Chip, StatusOut } from './api';
import { api as rtk, read } from './state/api';
import type { Write } from './state/http';
import type { Ask } from './ConfirmedWrite';

export interface ReviewRow {
  kind: string;
  id: string;
  tags: string[];
  chip: Chip | null;
  status: StatusOut | null;
  meta: string | null;
  title: string;
  hint: string | null;
  route: string | null;
  at: string | null;
  /** What a decision on it settles; empty: nothing to decide here. */
  keys: string[];
}

export interface Option {
  value: string;
  label: string;
}

export interface ReviewGroup {
  kind: string;
  label: string;
  count: number;
  rows: ReviewRow[];
  empty: string;
  alike: { label: string; keys: string[]; count: number }[];
  page: number;
  pages: number;
  /** Its items are confirmed or rejected here (alone, alike or selected) by the named reviewer. */
  decides: boolean;
}

export interface ReviewFilters {
  parts: Option[];
  ages: Option[];
  part: string | null;
  age: string | null;
  active: boolean;
}

export interface AlsoPair {
  a: string;
  b: string;
  label: string;
  conflict: boolean;
  answered_by: string | null;
}

export interface ReviewDetail {
  row: ReviewRow;
  /** Its kind adds facts or a decision; false: the row is all there is (an edit conflict). */
  has_detail: boolean;
  text: string | null;
  link: Option | null;
  also: AlsoPair[];
  rev: number | null;
  revs: number | null;
  cited: { state: string; title: string; route: string; picture: string | null }[];
  /** The kind's own facts (spec 063): at most one is set. */
  difference?: DifferenceDetail | null;
  reanchor?: ReanchorDetail | null;
  proposal?: ProposalDetail | null;
  suite?: SuiteDetail | null;
}

export interface DifferenceDetail {
  element: string | null;
  /** Each side: "Seen by", "Not seen by" (or reached), personas with their attributes as `label`. */
  sides: { label: string; personas: Option[] }[];
  compare: Option | null;
  advice: string;
}

export interface ReanchorDetail {
  amendment: string;
  key: string;
  rev: number;
  text: string | null;
  author: string;
  at: string;
  attachment: string | null;
  why: string;
  why_detail: string | null;
  was_on: Option | null;
  element: string | null;
  changed_by_scan: string | null;
  state_id: string;
  element_key: string;
  states: Option[];
}

export interface ProposalDetail {
  id: string;
  key: string | null;
  is_new: boolean;
  base_rev: number | null;
  next_rev: number;
  status: StatusOut;
  stale: boolean;
  head_rev: number | null;
  target: { before: string | null; after: string } | null;
  text: { before: string | null; after: string } | null;
  screen: string | null;
}

export interface SuiteStep {
  kind: string;
  name: string;
  value: string;
}

export interface SuiteVariant {
  id: string;
  expect: string;
  probe: string | null;
  fault: string | null;
  why: string;
  steps: SuiteStep[];
}

export interface SuiteDetail {
  id: string;
  trace_id: string;
  run_id: string;
  goal: string;
  start_url: string;
  step_label: string | null;
  variants: SuiteVariant[];
  expects: Option[];
  kinds: Option[];
  traces_file: string;
  run_command: string;
}

/** A suite as the person edits it: each variant kept or not, its steps with a drop mark. */
export interface SuiteEdit {
  variants: { id: string; keep: boolean; expect: string; steps: (SuiteStep & { drop?: boolean })[] }[];
  new: { id: string; from: string; expect: string };
}

export interface ExplainedRow {
  id: string;
  word: string;
  screen: string | null;
  finding: string;
  explanation: Chip;
  explanation_text: string;
  rule: string | null;
  at: string;
}

export interface DecidedRow {
  key: string;
  kind: string;
  claim: string;
  status: StatusOut;
  undone: boolean;
  actor: string;
  reason: string | null;
  at: string;
  is_rule: boolean;
}

export interface ReviewPage {
  portal: string;
  decides: boolean;
  tab: 'needs' | 'explained' | 'decided';
  total: number;
  explained_count: number;
  decided_count: number;
  same_screen_pairs: number;
  kinds: Option[];
  counts: Record<string, number>;
  show: string | null;
  groups: ReviewGroup[];
  empty_kinds: Option[];
  filters: ReviewFilters | null;
  reasons: Record<string, string[]>;
  selected: ReviewDetail | null;
  neighbours: { index: number; total: number; label: string; prev: string | null; next: string | null } | null;
  explained: ExplainedRow[];
  decided: DecidedRow[];
}

/** The page's address: its tab, a group's tab and page, the selection, the filters. */
export interface ReviewView {
  tab?: string | undefined;
  show?: string | undefined;
  select?: string | undefined;
  page?: number | undefined;
  part?: string | undefined;
  age?: string | undefined;
}

export const reviewQuery = (v: ReviewView): string => {
  const p = new URLSearchParams();
  if (v.tab && v.tab !== 'needs') p.set('tab', v.tab);
  if (v.show) p.set('show', v.show);
  if (v.select) p.set('select', v.select);
  if (v.page && v.page > 1) p.set('page', String(v.page));
  if (v.part) p.set('part', v.part);
  if (v.age) p.set('age', v.age);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
};

export const reviewHref = (portal: string, v: ReviewView = {}) =>
  `/app/portals/${encodeURIComponent(portal)}/review${reviewQuery(v)}`;

export const reviewKey = (portal: string) => ['portals', portal, 'review'] as const;

const reviewApi = rtk.injectEndpoints({
  endpoints: (b) => ({
    review: read<ReviewPage, { portal: string; v: ReviewView }>(
      b,
      ({ portal, v }) => `/api/portals/${encodeURIComponent(portal)}/review${reviewQuery(v)}`,
      ({ portal, v }) => [...reviewKey(portal), v],
    ),
  }),
});

export const useReview = (portal: string, v: ReviewView) => reviewApi.useReviewQuery({ portal, v });

const api = (portal: string) => `/api/portals/${encodeURIComponent(portal)}/review`;

/** Review's writes, by what they do. */
export const reviewWrites = {
  decide: (portal: string, keys: readonly string[], action: 'confirm' | 'reject', reason: string, also: readonly string[] = []): Write => ({
    path: `${api(portal)}/decide`,
    body: { keys, action, reason, also },
  }),
  undo: (portal: string, decision: string): Write => ({ path: `${api(portal)}/undo`, body: { decision } }),
  record: (portal: string, key: string, rev: number, action: 'confirm' | 'reject' | 'comment', text = ''): Write => ({
    path: `${api(portal)}/records/${encodeURIComponent(key)}`,
    body: { action, rev, text },
  }),
  reanchor: (portal: string, amendment: string, stateId: string, element: string, text: string): Write => ({
    path: `${api(portal)}/amendments/${encodeURIComponent(amendment)}/reanchor`,
    body: { state_id: stateId, element, text },
  }),
  dismiss: (portal: string, amendment: string): Write => ({
    path: `${api(portal)}/amendments/${encodeURIComponent(amendment)}/dismiss`,
    body: {},
  }),
  proposal: (portal: string, id: string, verb: 'apply' | 'discard' | 'undo'): Write => ({
    path: `${api(portal)}/proposals/${encodeURIComponent(id)}/${verb}`,
    body: {},
  }),
  suite: (portal: string, id: string, action: 'save' | 'approve' | 'dismiss', edit: SuiteEdit): Write => ({
    path: `${api(portal)}/suites/${encodeURIComponent(id)}`,
    body: { action, ...edit },
  }),
};

/** The ask that takes a decision back: every item it decided goes back to the queue. */
export const undoAsk =
  (portal: string) =>
  (decision: string): Ask => ({
    title: 'Undo this decision?',
    text: 'Every item it decided goes back to Review. The chat service refuses when anything changed since.',
    confirm: 'Undo',
    write: reviewWrites.undo(portal, decision),
  });
