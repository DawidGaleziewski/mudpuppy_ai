// The dashboard's JSON API (`apps/dashboard/src/mudpuppy_dashboard/web/api_*.py`), typed as the
// pydantic models in `queries_app.py` declare it, and one TanStack Query hook per endpoint.
import { useQuery } from '@tanstack/react-query';
import type { StatusKind } from '../design-system';
import { currentAsOf, withAsOf } from './asOf';
import { currentStore, withStore } from './store';

export interface PortalSummary {
  id: string;
  scans: number;
  running: number;
  last_scan_at: string | null;
}

export interface PortalList {
  environment: string;
  portals: PortalSummary[];
  other_environments: string[];
  /** The Workbench beta is on: the nav offers it. */
  workbench?: boolean;
  /** Live MCP servers that disagree with the console (R-61), each named. */
  warnings?: string[];
}

/**
 * A status as the dashboard's one status map gives it (`status_map.py`): the shape and the word.
 * The app never maps a product value itself; `shape` null is a kind, shown as a plain label.
 */
export interface StatusOut {
  shape: StatusKind | null;
  word: string;
}

export interface ScanSummary {
  id: string;
  persona: string;
  mode: string;
  /** AI scan or Check run (designer 19/12). */
  kind: string;
  status: StatusOut;
  steps_used: number;
  max_steps: number | null;
  started_at: string;
  ended_at: string | null;
  warning: string | null;
}

export interface ScanList {
  portal: string;
  scans: ScanSummary[];
  total: number;
}

/** A failed API call: the HTTP status and the API's own message, for the error state. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string): Promise<T> {
  // the chosen data store (spec 019); a model page As of a past version asks its API as of that
  // version (spec 040 FR-001)
  const r = await fetch(withStore(withAsOf(path, currentAsOf()), currentStore()), { headers: { accept: 'application/json' } });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof body?.detail === 'string' ? body.detail : `${String(r.status)} ${r.statusText}`;
    throw new ApiError(r.status, detail);
  }
  return (await r.json()) as T;
}

// The frame reads it on every page (the Workbench switch): kept for 30 s, not fetched per page.
export const usePortals = () =>
  useQuery({ queryKey: ['portals'], queryFn: () => getJson<PortalList>('/api/portals'), staleTime: 30_000 });

export const useScans = (portal: string) =>
  useQuery({
    queryKey: ['portals', portal, 'scans'],
    queryFn: () => getJson<ScanList>(`/api/portals/${encodeURIComponent(portal)}/scans`),
    // A running scan moves: refresh while one runs (live data never goes through the model).
    refetchInterval: (q) =>
      q.state.data?.scans.some((s) => s.status.shape === 'running') ? 2000 : false,
  });

/** A mark beside a claim (`queries_app.Chip`). */
export interface ChipOut {
  word: string;
  variant: 'fail' | 'ok' | 'tobe' | 'dashed' | null;
}

/** One thing that needs a person (`queries_app.NeedsItem`). */
export interface NeedsItem {
  kind: string;
  id: string;
  chip: ChipOut;
  claim: string;
  where: string | null;
  hint: string;
  at: string;
  status: StatusOut | null;
  /** The hypotheses a decision on it settles. */
  keys: string[];
}

export interface PortalHomeData {
  portal: string;
  environment: string;
  model_seq: number | null;
  model_built_at: string | null;
  lanes: { part: string; release: string; observed: boolean; since: string; was: string | null }[];
  /** `kind`: AI scan or Check run; `summary`: "17 Oct 10:05Z · 64 checks" (the scan line's grammar). */
  last_scan: { id: string; started_at: string; status: StatusOut; kind: string; steps: number; summary: string } | null;
  needs: {
    total: number;
    by_kind: { kind: string; label: string; count: number }[];
    top: NeedsItem[];
  };
  changes: {
    all: number;
    needs: number;
    explained: number;
    by_process: { key: string | null; name: string; changes: number; needs: number; explained: number }[];
  };
  processes: number;
  proposed: number;
  rules: { total: number; by_status: { status: StatusOut; count: number }[] };
}

export const usePortalHome = (portal: string) =>
  useQuery({
    queryKey: ['portals', portal, 'home'],
    queryFn: () => getJson<PortalHomeData>(`/api/portals/${encodeURIComponent(portal)}/home`),
  });
