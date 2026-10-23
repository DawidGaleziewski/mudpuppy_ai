// Business rules (`web/api_rules.py` over `queries_app_rules.py`), typed as the pydantic models
// declare them, and the rule's writes: Reword, and Run the rule tests (a check run, `writes.replay`).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';
import type { Option } from './api-review';
import type { Write } from './api-write';

export interface RuleRow {
  key: string;
  /** BR-nnn once documented, else the H key: the key people use. */
  shown_key: string;
  claim: string;
  status: StatusOut;
  screen_key: string | null;
  screen_title: string | null;
  action: string | null;
  passed: number;
  failed: number;
  waiting: number;
  last_tested: string | null;
}

export interface RulesPage {
  portal: string;
  total: number;
  statuses: Option[];
  status: string | null;
  groups: { status: StatusOut; rules: RuleRow[] }[];
  export: { zip: string; csv: string };
  /** The reviewer is set: Run the rule tests and Reword are offered. */
  writes: boolean;
}

export interface RuleTable {
  inputs: string[];
  hit_policy: string;
  rows: { cells: { cond: string; any: boolean }[]; screen: string; is_screen: boolean; result: string | null }[];
}

export interface RuleEvent {
  status: StatusOut;
  actor: string;
  reason: string;
  at: string;
  undo: boolean;
  by_person: boolean;
  mark: 'ok' | 'failed' | 'draft';
}

export interface RulePage {
  portal: string;
  row: RuleRow;
  br_key: string | null;
  doc_href: string | null;
  fitness: number | null;
  executions: number | null;
  table: RuleTable | null;
  wordings: { wording: string; actor: string; reason: string | null; at: string }[];
  tests: { inputs: string[]; expect: string; got: string | null; verdict: StatusOut }[];
  history: RuleEvent[];
  files: Option[];
  writes: boolean;
  /** It no longer holds on a newer release and waits to be mined again. */
  changed: boolean;
  /** Confirmed, yet no business rule record cites it. */
  uncited: boolean;
}

export interface RuleExport {
  markdown: string | null;
  error: string | null;
}

const api = (portal: string) => `/api/portals/${encodeURIComponent(portal)}/rules`;

export const rulesHref = (portal: string, status?: string) =>
  `/app/portals/${encodeURIComponent(portal)}/rules${status ? `?status=${encodeURIComponent(status)}` : ''}`;

export const ruleHref = (portal: string, key: string) => `/app/portals/${encodeURIComponent(portal)}/rules/${encodeURIComponent(key)}`;

export const rulesKey = (portal: string) => ['portals', portal, 'rules'] as const;

export const useRules = (portal: string, status: string | undefined) =>
  useQuery({
    queryKey: [...rulesKey(portal), status ?? null],
    queryFn: () => getJson<RulesPage>(`${api(portal)}${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    placeholderData: keepPreviousData,
  });

export const useRule = (portal: string, key: string) =>
  useQuery({ queryKey: [...rulesKey(portal), 'one', key], queryFn: () => getJson<RulePage>(`${api(portal)}/${encodeURIComponent(key)}`) });

/** The rule in the export: built by a command, so asked for after the page shows. */
export const useRuleExport = (portal: string, key: string) =>
  useQuery({ queryKey: [...rulesKey(portal), 'export', key], queryFn: () => getJson<RuleExport>(`${api(portal)}/${encodeURIComponent(key)}/export`) });

export const ruleWrites = {
  /** A person's sentence for the rule (`key`: its H key), in place of the mined one. */
  reword: (portal: string, key: string, wording: string, reason: string): Write => ({
    path: `${api(portal)}/${encodeURIComponent(key)}/reword`,
    body: { wording, reason },
  }),
  /** The rule tests and error replays on the headless driver. */
  replay: (portal: string): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/check-runs`,
    body: { kind: 'replay' },
  }),
};
