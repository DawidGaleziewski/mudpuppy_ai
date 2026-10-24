// One process (`web/api_process.py` over `queries_app_process.py`), typed as the pydantic models
// declare them.
import type { StatusOut } from './api';
import { api, read } from './state/api';
import type { Option } from './api-map';
import type { ProcessRow } from './api-processes';
import type { RawStep } from './stepOps';

export interface ProcessStep {
  id: string;
  n: number;
  title: string;
  route: string | null;
  state: string | null;
  observed: boolean;
  built_from: string[];
  annotations: { text: string; author: string; at: string }[];
  shot: string | null;
  wire: string | null;
  scans: number;
  records: { kind: string; label: string; records: { key: string; title: string; status: StatusOut | null }[] }[];
  documented: boolean;
  amendments: number;
  reanchor: number;
}

export interface AsIsDoc {
  questions: number;
  unconfirmed: number;
  reanchor: number;
  sign_off: { by: string; at: string; signed_rev: number | null; head_rev: number; changed: boolean } | null;
  sign_off_action: string | null;
  stages: Option[];
  addable: Option[];
}

export interface ModelFacts {
  model_seq: number;
  triggers: { text: string; screen_key: string | null; count: number }[];
  outcomes: string[];
  explored: StatusOut;
  explored_text: string | null;
  checked: string | null;
  rules: { key: string; claim: string; status: StatusOut }[];
  paths: { name: string; screens: [string, string][]; outcome: string; count: number }[];
}

export type ProcessModel = ProcessRow['models'][number];

export interface ProcessPage {
  portal: string;
  id: string;
  key: string;
  name: string;
  persona: string;
  rev: number;
  stage: StatusOut;
  stage_value: string;
  live: ProcessRow['live'];
  screens: number;
  record_key: string | null;
  archived_at: string | null;
  models: ProcessModel[];
  model: ProcessModel;
  to_be_first: string | null;
  steps: ProcessStep[];
  selected: ProcessStep | null;
  as_is: AsIsDoc | null;
  facts: ModelFacts | null;
  /** The to-be editor; null on A. */
  editor: Editor | null;
  /** Its scope beyond A's steps and the merges it took part in (spec 078). */
  scope?: ProcessScope | null;
}

export interface MergeOut {
  id: string;
  kept_key: string;
  kept_name: string;
  absorbed_key: string;
  absorbed_name: string;
  by: string;
  reason: string | null;
  at: string;
  undone_at: string | null;
}

export interface ProcessScope {
  /** "Not on the observed path yet" (designer T-05). */
  off_path: { state: string; title: string; route: string }[];
  merged_into: MergeOut | null;
  merges: MergeOut[];
  /** To-be models moved over by a merge, branched from another process's as-is. */
  from_other: string[];
}

export interface Editor {
  editable: boolean;
  author: string | null;
  draft: { base_rev: number; updated_at: string; pending: number; conflict: boolean } | null;
  /** The steps exactly as stored (the draft's when there is one): what the page edits and autosaves. */
  steps: RawStep[];
  changes: Record<string, StatusOut>;
  removed: string[];
  as_is: string[];
}

/** A documentation record's page. */
export const docHref = (portal: string, key: string) => `/app/portals/${encodeURIComponent(portal)}/docs/${encodeURIComponent(key)}`;

export const processKey =(portal: string, key: string) => ['portals', portal, 'processes', key] as const;

interface ProcessArg {
  portal: string;
  key: string;
  model: string;
  step: string;
}

function processPath({ portal, key, model, step }: ProcessArg): string {
  const p = new URLSearchParams();
  if (model) p.set('model', model);
  if (step) p.set('step', step);
  const qs = p.toString();
  return `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(key)}${qs ? `?${qs}` : ''}`;
}

const processApi = api.injectEndpoints({
  endpoints: (b) => ({
    processPage: read<ProcessPage, ProcessArg>(b, processPath, (a) => [...processKey(a.portal, a.key), a.model, a.step]),
  }),
});

export const useProcessPage = (portal: string, key: string, model: string, step: string) =>
  processApi.useProcessPageQuery({ portal, key, model, step });
