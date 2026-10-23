// The Processes list (`web/api_processes.py` over `queries_app_processes.py`), typed as the pydantic
// models declare them.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';

export interface ProcessRow {
  id: string;
  key: string;
  name: string;
  persona: string;
  rev: number;
  stage: StatusOut;
  start_route: string | null;
  end_route: string | null;
  models: { label: string; kind: string; rev: number; draft: StatusOut | null }[];
  live: { environment: string; status: StatusOut; what: string }[];
  screens: number;
  amendments: number;
  last_by: string;
  last_at: string;
}

export interface Suggestion {
  id: string;
  name: string;
  persona: string;
  routes: string[];
  why: string;
}

export interface LooseScreen {
  state: string;
  title: string;
  route: string;
  shot: string | null;
  wire: string | null;
  scans: number;
}

export interface ProcessList {
  portal: string;
  archived: boolean;
  archived_count: number;
  page: number;
  pages: number;
  total: number;
  stages: StatusOut[];
  rows: ProcessRow[];
  suggestions: Suggestion[];
  /** What a suggestion is: "Inferred · not saved". */
  suggested: StatusOut;
  loose: LooseScreen[];
  default_persona: string;
}

export const processesKey = (portal: string) => ['portals', portal, 'processes'] as const;

export const useProcesses = (portal: string, archived: boolean, page: number) =>
  useQuery({
    queryKey: [...processesKey(portal), archived, page],
    queryFn: () => {
      const p = new URLSearchParams();
      if (archived) p.set('archived', 'true');
      if (page > 1) p.set('page', String(page));
      const qs = p.toString();
      return getJson<ProcessList>(`/api/portals/${encodeURIComponent(portal)}/processes${qs ? `?${qs}` : ''}`);
    },
    placeholderData: keepPreviousData,
  });

/** One process's page, on a model (its default when left out). */
export const processHref = (portal: string, key: string, model?: string) =>
  `/app/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(key)}${model ? `?model=${encodeURIComponent(model)}` : ''}`;

/** The process's htmx pages that have not moved yet: Compare, History, the documentation export. */
export const htmxProcessHref = (key: string, page: 'compare' | 'history' | 'export', query = '') =>
  `/processes/${encodeURIComponent(key)}/${page}${query}`;
