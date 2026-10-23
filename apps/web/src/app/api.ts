// The dashboard's JSON API (`apps/dashboard/src/mudpuppy_dashboard/web/api_*.py`), typed as the
// pydantic models in `queries_app.py` declare it, and one TanStack Query hook per endpoint.
import { useQuery } from '@tanstack/react-query';

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
}

export type ScanStatus = 'running' | 'completed' | 'stopped_warning' | 'interrupted';

export interface ScanSummary {
  id: string;
  persona: string;
  mode: string;
  status: ScanStatus;
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
  const r = await fetch(path, { headers: { accept: 'application/json' } });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof body?.detail === 'string' ? body.detail : `${String(r.status)} ${r.statusText}`;
    throw new ApiError(r.status, detail);
  }
  return (await r.json()) as T;
}

export const usePortals = () =>
  useQuery({ queryKey: ['portals'], queryFn: () => getJson<PortalList>('/api/portals') });

export const useScans = (portal: string) =>
  useQuery({
    queryKey: ['portals', portal, 'scans'],
    queryFn: () => getJson<ScanList>(`/api/portals/${encodeURIComponent(portal)}/scans`),
    // A running scan moves: refresh while one runs (live data never goes through the model).
    refetchInterval: (q) => (q.state.data?.scans.some((s) => s.status === 'running') ? 2000 : false),
  });
