// Plan next scan and Recover (`web/api_plan.py` over `queries_app_plan.py`), typed as the pydantic
// models declare them, and Start scan. Resume, Retry this path and Skip are `writes` in api-write.
import type { StatusOut } from './api';
import { api, read } from './state/api';
import type { Write } from './state/http';

export interface PlanOption {
  value: string;
  label: string;
  hint: string;
}

export interface PlanPage {
  portal: string;
  total: number;
  types: PlanOption[];
  groups: { kind: string; label: string; marks: { state: string | null; title: string; route: string; reach: string | null }[] }[];
  personas: string[];
  environments: string[];
  variations: PlanOption[];
}

export interface RecoverPage {
  scan: string;
  portal: string;
  persona: string;
  environment: string;
  status: StatusOut;
  reason: string;
  failure_class: string;
  steps: number;
  pending: number;
  last_state: [string, string, string] | null;
  failed: { transition: string; label: string; route: string; error: string }[];
  attempts: { scan: string; type: string; variation: string; status: StatusOut; passed: boolean | null; started_at: string }[];
  variations: PlanOption[];
}

export const planHref = (portal: string) => `/app/portals/${encodeURIComponent(portal)}/scans/plan`;
export const recoverHref = (scan: string) => `/app/scans/${encodeURIComponent(scan)}/recover`;

export const planKey = (portal: string) => ['portals', portal, 'scans', 'plan'] as const;
export const recoverKey = (scan: string) => ['scans', scan, 'recovery'] as const;

const planApi = api.injectEndpoints({
  endpoints: (b) => ({
    plan: read<PlanPage, string>(b, (portal) => `/api/portals/${encodeURIComponent(portal)}/scans/plan`, planKey),
    recovery: read<RecoverPage, string>(b, (scan) => `/api/scans/${encodeURIComponent(scan)}/recovery`, recoverKey),
  }),
});

export const usePlan = (portal: string) => planApi.usePlanQuery(portal);

export const useRecovery = (scan: string) => planApi.useRecoveryQuery(scan);

export const startScan = (portal: string, body: { run_type: string; persona: string; environment: string; depth: number; variation: string }): Write => ({
  path: `/api/portals/${encodeURIComponent(portal)}/scans/plan`,
  body,
});
