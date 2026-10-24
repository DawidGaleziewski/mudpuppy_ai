// Docs (`web/api_docs.py` over `queries_app_docs.py`), typed as the pydantic models declare them:
// a portal's documentation as an SRS, one section at a time. Read-only.
import type { StatusOut } from './api';
import { api, read } from './state/api';
import type { Option } from './api-review';

export interface DocsSection {
  id: string;
  label: string;
  count: number;
}

export interface DocRecordRow {
  key: string;
  title: string;
  kind: string;
  status: StatusOut;
  confidence: StatusOut;
  rev: number;
  summary: string | null;
  not_observable: StatusOut | null;
  followup: StatusOut | null;
  blocked_reason: string | null;
  confirmed_rev: number | null;
  evidence: number;
  scans: number;
  related: string[];
  /** The record's page, with this list for its Prev / Next. */
  href: string;
}

export interface DocsFilters {
  kinds: Option[];
  statuses: Option[];
  confidences: Option[];
  flags: Option[];
  kind: string | null;
  status: string | null;
  confidence: string | null;
  flag: string | null;
}

export interface DocsPage {
  portal: string;
  sections: DocsSection[];
  section: DocsSection;
  statuses: { status: StatusOut; count: number }[];
  counts: DocsSection[];
  sessions: { id: string; short: string; status: StatusOut; started_at: string; summary: string | null; href: string }[];
  records: { items: DocRecordRow[]; total: number; next_cursor: string | null; filters: DocsFilters; matrix: boolean } | null;
  diagram: { source: string; caption: string } | null;
}

/** The page's query, as its address keeps it. */
export interface DocsView {
  section?: string | undefined;
  kind?: string | undefined;
  status?: string | undefined;
  confidence?: string | undefined;
  flag?: string | undefined;
  cursor?: string | undefined;
}

export const docsQuery = (v: DocsView): string => {
  const p = new URLSearchParams();
  for (const [k, value] of Object.entries(v)) if (value) p.set(k, value as string);
  if (p.get('section') === 'overview') p.delete('section');
  const qs = p.toString();
  return qs ? `?${qs}` : '';
};

export const docsHref = (portal: string, v: DocsView = {}) => `/app/portals/${encodeURIComponent(portal)}/docs${docsQuery(v)}`;

const docsApi = api.injectEndpoints({
  endpoints: (b) => ({
    docs: read<DocsPage, { portal: string; v: DocsView }>(
      b,
      ({ portal, v }) => `/api/portals/${encodeURIComponent(portal)}/docs${docsQuery(v)}`,
      ({ portal, v }) => ['portals', portal, 'docs', v],
    ),
  }),
});

export const useDocs = (portal: string, v: DocsView) => docsApi.useDocsQuery({ portal, v });
