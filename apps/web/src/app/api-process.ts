// One process (`web/api_process.py` over `queries_app_process.py`), typed as the pydantic models
// declare them.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';
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

/** A documentation record's page (htmx Docs until it moves). */
export const docHref = (portal: string, key: string) => `/app/portals/${encodeURIComponent(portal)}/docs/${encodeURIComponent(key)}`;

export const processKey =(portal: string, key: string) => ['portals', portal, 'processes', key] as const;

export const useProcessPage = (portal: string, key: string, model: string, step: string) =>
  useQuery({
    queryKey: [...processKey(portal, key), model, step],
    queryFn: () => {
      const p = new URLSearchParams();
      if (model) p.set('model', model);
      if (step) p.set('step', step);
      const qs = p.toString();
      return getJson<ProcessPage>(`/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(key)}${qs ? `?${qs}` : ''}`);
    },
    placeholderData: keepPreviousData,
  });
