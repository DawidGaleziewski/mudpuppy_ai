// The dashboard's JSON API (`apps/dashboard/src/mudpuppy_dashboard/web/api_*.py`), typed as the
// pydantic models in `queries_app.py` declare it: the portals, a portal's scans and home, as RTK
// Query endpoints (spec 076; `state/api.ts`), one hook per endpoint.
import type { StatusKind } from '../design-system';
import { api, read, useLive } from './state/api';

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

const p = (portal: string) => `/api/portals/${encodeURIComponent(portal)}`;

const portalsApi = api.injectEndpoints({
  endpoints: (b) => ({
    portals: read<PortalList, void>(b, () => '/api/portals', () => ['portals']),
    scans: read<ScanList, string>(b, (portal) => `${p(portal)}/scans`, (portal) => ['portals', portal, 'scans']),
    portalHome: read<PortalHomeData, string>(b, (portal) => `${p(portal)}/home`, (portal) => ['portals', portal, 'home']),
  }),
});

// The frame reads it on every page (the Workbench switch): kept for 30 s, not fetched per page.
export const usePortals = () => portalsApi.usePortalsQuery(undefined, { refetchOnMountOrArgChange: 30 });

/** A running scan moves: read again every 2 s while one runs (live data never goes through the model). */
export const useScans = (portal: string) =>
  useLive(portalsApi.useScansQuery, portal, (d: ScanList) => d.scans.some((s) => s.status.shape === 'running'), 2000);

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

export const usePortalHome = (portal: string) => portalsApi.usePortalHomeQuery(portal);
