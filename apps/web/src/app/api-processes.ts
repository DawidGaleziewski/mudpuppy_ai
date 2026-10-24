// The Processes list (`web/api_processes.py` over `queries_app_processes.py`), typed as the pydantic
// models declare them.
import type { StatusOut } from './api';
import { api, read } from './state/api';

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
  /** The row picture: the screenshot's small WebP (spec 079); the dialog shows `shot`. */
  thumb?: string | null;
  scans: number;
  /** The model screen it is a variant of (its page, its variants in the dialog). */
  screen_key?: string | null;
  last_seen?: string | null;
  /** The personas whose scans recorded it (spec 079, D-6 (a)); empty: the default persona's. */
  personas?: string[];
  variants?: number;
}

/** A saved process the Add to process menu offers, with the screens already in it (designer T-05). */
export interface Target {
  id: string;
  key: string;
  name: string;
  persona: string;
  steps: number;
  states: string[];
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
  /** Every saved process in use, A–Z: what a screen can be added to (the list itself is paged). */
  targets: Target[];
}

/** The screens in no process, sorted into processes (designer T-05). */
export const looseHref = (portal: string) => `/app/portals/${encodeURIComponent(portal)}/processes/loose`;

export const processesKey = (portal: string) => ['portals', portal, 'processes'] as const;

type ProcessesArg = { portal: string; archived: boolean; page: number };

function processesPath({ portal, archived, page }: ProcessesArg): string {
  const p = new URLSearchParams();
  if (archived) p.set('archived', 'true');
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return `/api/portals/${encodeURIComponent(portal)}/processes${qs ? `?${qs}` : ''}`;
}

const processesApi = api.injectEndpoints({
  endpoints: (b) => ({
    processes: read<ProcessList, ProcessesArg>(b, processesPath, (a) => [...processesKey(a.portal), a.archived, a.page]),
  }),
});

/** `enabled` false: not asked yet (a process page asks for the list only when Merge with… opens). */
export const useProcesses = (portal: string, archived: boolean, page: number, enabled = true) => processesApi.useProcessesQuery({ portal, archived, page }, { skip: !enabled });

/** One process's page, on a model (its default when left out). */
export const processHref = (portal: string, key: string, model?: string) =>
  `/app/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(key)}${model ? `?model=${encodeURIComponent(model)}` : ''}`;

/** A process's documentation export: the export's files as tabs, and the folder as a zip. */
export const exportHref = (portal: string, key: string) =>
  `/app/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(key)}/documentation`;
