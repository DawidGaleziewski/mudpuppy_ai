// One record and one analysis session of Docs (`web/api_docs.py` over `queries_app_doc.py`,
// `queries_app_doc_content.py` and `queries_app_doc_session.py`), typed as the pydantic models
// declare them, and the writes a record offers: its review (`reviewWrites.record`) and Open in
// Processes.
import { useQuery } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';
import type { Write } from './api-write';

export interface Ref {
  label: string;
  href: string;
  title: string | null;
}

export interface ContentFact {
  label: string;
  values: string[];
  mono: boolean;
  lang: string | null;
  listed: boolean;
}

/** A piece of a record's content: a sentence, facts, a table or preformatted text. */
export interface ContentBlock {
  type: 'text' | 'facts' | 'table' | 'code';
  text: string | null;
  strong: boolean;
  facts: ContentFact[];
  caption: string | null;
  headers: string[];
  rows: string[][];
}

export interface DocMark {
  n: number;
  key: string;
  note: string | null;
  visible: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DocFigure {
  state_id: string;
  title: string;
  route: string;
  shot: string | null;
  wire: string | null;
  cut_at: number | null;
  marks: DocMark[];
}

export interface DocEvidence {
  kind: string;
  label: string | null;
  resolved: boolean;
  href: string | null;
  tag: string | null;
  region: string | null;
  note: string | null;
  scan: Ref | null;
  scan_note: string | null;
}

export interface DocReview {
  id: string;
  action: StatusOut;
  reviewer: string;
  text: string | null;
  at: string;
}

export interface DocRevision {
  rev: number;
  shown: boolean;
  href: string;
  status: StatusOut;
  confidence: StatusOut;
  not_observable: boolean;
  change: string;
  at: string;
  change_note: string | null;
  session: Ref;
  reviews: DocReview[];
}

export interface DocRecordPage {
  portal: string;
  /** The record's id: what the assistant's "This page" names. */
  id: string;
  key: string;
  title: string;
  kind: string;
  status: StatusOut;
  confidence: StatusOut;
  not_observable: StatusOut | null;
  followup: StatusOut | null;
  blocked_reason: string | null;
  rev: number;
  latest_rev: number;
  confirmed_rev: number | null;
  is_latest: boolean;
  change: string;
  change_note: string | null;
  session: Ref;
  written_at: string;
  blocks: ContentBlock[];
  variant_maps: { variant: string; outcome: StatusOut; scan: Ref; source: string }[];
  figures: DocFigure[];
  figures_open: boolean;
  evidence: DocEvidence[];
  relations: { direction: string; type: string; key: string; title: string; status: StatusOut; href: string }[];
  history: DocRevision[];
  panel: { enabled: boolean; rev: number; status: string; can_decide: boolean; viewing_latest: boolean; reviews: DocReview[] };
  neighbours: { position: number; total: number; label: string; list: string; prev: string | null; next: string | null } | null;
  process: { export: string; linked: Ref | null; can_open: boolean } | null;
}

export interface DocSessionPage {
  portal: string;
  id: string;
  status: StatusOut;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  scans: { scan: Ref; mode: string; persona: string; status: StatusOut; started_at: string }[];
  passes: { name: string; summary: string | null; completed_at: string | null }[];
  written: { key: string; title: string; href: string; change: string; status: StatusOut; confidence: StatusOut }[];
  written_total: number;
  next_cursor: string | null;
  gaps: string[];
}

const api = (portal: string) => `/api/portals/${encodeURIComponent(portal)}/docs`;

export const docKey = (portal: string) => ['portals', portal, 'docs'] as const;

/** One record, at revision `rev`, opened from the Docs list `list` (its Prev / Next). */
export const useDocRecord = (portal: string, key: string, rev: string | null, list: string | null) => {
  const p = new URLSearchParams();
  if (rev) p.set('rev', rev);
  if (list) p.set('list', list);
  const qs = p.toString();
  return useQuery({
    queryKey: [...docKey(portal), 'record', key, rev, list],
    queryFn: () => getJson<DocRecordPage>(`${api(portal)}/${encodeURIComponent(key)}${qs ? `?${qs}` : ''}`),
  });
};

export const useDocSession = (portal: string, session: string, cursor: string | null) =>
  useQuery({
    queryKey: [...docKey(portal), 'session', session, cursor],
    queryFn: () => getJson<DocSessionPage>(`${api(portal)}/sessions/${encodeURIComponent(session)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  });

export const docWrites = {
  /** A BA process record as a workspace process with its screens in walking order. */
  openProcess: (portal: string, recordKey: string): Write => ({
    path: `/api/portals/${encodeURIComponent(portal)}/processes/from-record`,
    body: { record_key: recordKey },
  }),
};
