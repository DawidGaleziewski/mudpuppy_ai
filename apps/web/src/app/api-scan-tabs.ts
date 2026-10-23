// A scan's sections (`web/api_scan_tabs.py` over `queries_app_scan_tabs.py`), typed as the pydantic
// models declare them: one endpoint per tab, the paged ones by cursor with their filters.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';
import type { Option } from './api-map';

export interface Evidence {
  ref: string;
  /** The picture's URL; null for a ref shown as its path. */
  href: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  next_cursor: string | null;
}

export interface StateRow {
  state: string;
  title: string;
  route: string;
  picture: string | null;
  confidence: StatusOut;
  stabilization: string;
  cluster: string;
  evidence: Evidence | null;
  observed_at: string;
}

export interface Count {
  value: string;
  status: StatusOut;
  also: StatusOut | null;
  count: number;
}

export interface ActionRow {
  id: string;
  name: string | null;
  role: string;
  safety: string;
  decision: StatusOut;
  skip_reason: string | null;
  locator: string | null;
  href: string | null;
}

export interface ActionsTab extends Paged<ActionRow> {
  counts: Count[];
  safety_options: Option[];
  allowed_options: Option[];
  filter: { safety_class: string | null; allowed: string | null };
}

export interface FrontierRow {
  id: string;
  status: StatusOut;
  role: string | null;
  name: string | null;
  href: string | null;
  safety: string;
  depth: number;
  priority: number;
  reason: string | null;
}

export interface FrontierTab extends Paged<FrontierRow> {
  counts: Count[];
  status_options: Option[];
  filter: { status: string | null };
}

export interface FormRow {
  id: string;
  state: string;
  fields: { name: string; type: string; required: boolean }[] | null;
  raw: string | null;
  confidence: StatusOut;
  evidence: Evidence | null;
}

export interface NetworkRow {
  id: string;
  method: string;
  url_template: string;
  transition: string | null;
  code: number;
  status: StatusOut;
  request: string | null;
  response: string | null;
  console_errors: string | null;
  errors: number;
}

export interface RobotsRow {
  host: string;
  url: string;
  outcome: StatusOut;
  http_status: number | null;
  truncated: boolean;
  group: string | null;
  product_token: string;
  crawl_delay_s: number | null;
  fetched_at: string;
  evidence: Evidence | null;
}

export interface DecisionRow {
  id: string;
  kind: StatusOut;
  rule: string | null;
  reason: string;
  detail: string | null;
  subject: string | null;
  at: string;
}

export interface DecisionsTab extends Paged<DecisionRow> {
  groups: { kind: StatusOut; rule: string | null; count: number; example: string }[];
  kind_options: Option[];
  rule_options: Option[];
  filter: { kind: string | null; rule: string | null };
}

export interface DocRow {
  key: string;
  portal: string;
  title: string;
  kind: string;
  rev: number;
  status: StatusOut;
  confidence: StatusOut;
  cites: { kind: string; id: string; tab: string | null; note: string | null }[];
}

/** What each section answers. */
export interface Sections {
  states: StateRow[];
  actions: ActionsTab;
  frontier: FrontierTab;
  forms: FormRow[];
  network: Paged<NetworkRow>;
  robots: RobotsRow[];
  decisions: DecisionsTab;
  docs: Paged<DocRow>;
}

export type SectionId = keyof Sections;

/** The sections this app draws (the others link to the htmx page). */
export const SECTIONS: readonly SectionId[] = ['states', 'actions', 'frontier', 'forms', 'network', 'robots', 'decisions', 'docs'];

export const isSection = (tab: string): tab is SectionId => (SECTIONS as readonly string[]).includes(tab);

/**
 * One section of a scan, asked with `params` (its filters and cursor, as the page address carries
 * them). A new filter keeps the old rows on screen until the new ones arrive.
 */
export function useSection<K extends SectionId>(scan: string, tab: K, params: URLSearchParams) {
  const qs = params.toString();
  return useQuery({
    queryKey: ['scans', scan, tab, qs],
    queryFn: () => getJson<Sections[K]>(`/api/scans/${encodeURIComponent(scan)}/${tab}${qs ? `?${qs}` : ''}`),
    placeholderData: keepPreviousData,
  });
}
