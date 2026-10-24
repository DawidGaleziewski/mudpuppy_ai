// A scan's Trace and Process (`web/api_scan_trace.py` over `queries_app_trace*.py`), typed as the
// pydantic models declare them.
import type { StatusOut } from './api';
import { api, read } from './state/api';
import type { Option } from './api-map';
import type { Evidence, Paged } from './api-scan-tabs';

export interface TraceSummary {
  has_trace: boolean;
  calls: number;
  by_tool: { name: string; count: number }[];
  by_status: { status: StatusOut; count: number }[];
  tokens: string;
  levels: string;
  health: StatusOut;
  health_parts: string[];
  phases: { name: string; count: number; sum: string; p50: string; p95: string }[];
  slowest: { id: string; seq: number; name: string; duration: string; status: StatusOut }[];
}

export interface TraceCall {
  id: string;
  seq: number;
  name: string;
  status: StatusOut;
  duration: string;
  rationale: string | null;
  between_calls: boolean;
  tool_use_id: string | null;
  payload: Evidence | null;
  attrs: string;
  pw_trace: string | null;
  agent: { imported: boolean; tokens: string | null; text: string | null };
}

export interface TraceCalls extends Paged<TraceCall> {
  filter: { tool: string[]; status: string[]; problems: boolean };
  tool_options: Option[];
  status_options: Option[];
  unmatched: { tool: string; at: string; text: string | null }[];
}

export interface Fact {
  label: string;
  value: string;
  mono: boolean;
}

export interface TraceEvent {
  kind: string;
  name: string;
  summary: string;
  detail: { facts: Fact[]; lines: string[]; rule: string | null };
}

export interface SpanChildren {
  scan: string | null;
  phases: { name: string; status: StatusOut; duration: string; share: number; events: TraceEvent[] }[];
  events: TraceEvent[];
}

export interface ProcessTab {
  process: {
    name: string;
    goal: string;
    persona: string;
    outcome: StatusOut;
    observed_result: string | null;
    boundary_action: string | null;
    followup: string | null;
    started_at: string;
    ended_at: string | null;
    not_observable: string | null;
  } | null;
  diagram: string | null;
  steps: {
    id: string;
    ord: number;
    intent: string;
    kind: string;
    value: string | null;
    action: string | null;
    outcomes: string[];
    confidence: StatusOut;
    evidence: Evidence | null;
  }[];
}

const base = (scan: string) => `/api/scans/${encodeURIComponent(scan)}`;

const traceApi = api.injectEndpoints({
  endpoints: (b) => ({
    traceSummary: read<TraceSummary, string>(b, (scan) => `${base(scan)}/trace/summary`, (scan) => ['scans', scan, 'trace', 'summary']),
    traceCalls: read<TraceCalls, { scan: string; qs: string }>(
      b,
      ({ scan, qs }) => `${base(scan)}/trace${qs ? `?${qs}` : ''}`,
      ({ scan, qs }) => ['scans', scan, 'trace', qs],
    ),
    tracePhases: read<ScanPhases, string>(b, (scan) => `${base(scan)}/trace/phases`, (scan) => ['scans', scan, 'trace', 'phases']),
    spanChildren: read<SpanChildren, string>(b, (span) => `/api/spans/${encodeURIComponent(span)}/children`, (span) => ['spans', span, 'children']),
    scanProcess: read<ProcessTab, string>(b, (scan) => `${base(scan)}/process`, (scan) => ['scans', scan, 'process']),
  }),
});

export const useTraceSummary = (scan: string) => traceApi.useTraceSummaryQuery(scan);

/** One page of calls, asked with the page address's filters and cursor. */
export const useTraceCalls = (scan: string, params: URLSearchParams) => traceApi.useTraceCallsQuery({ scan, qs: params.toString() });

/** One phase of the scan's time (`queries_app_trace_phases.PhaseOut`). */
export interface ScanPhase {
  name: string;
  kind: 'work' | 'wait' | 'quiet';
  state: 'done' | 'running' | 'failed';
  start: string;
  end: string;
  seconds: number;
  first_step: number | null;
  last_step: number | null;
  time_line: string;
}

/** The scan's time cut into its phases, for the phase bar (designer 19/02). */
export interface ScanPhases {
  has_phases: boolean;
  summary: string;
  status: StatusOut | null;
  steps: number;
  phases: ScanPhase[];
  axis: { left: number; label: string }[];
}

export const useTracePhases = (scan: string) => traceApi.useTracePhasesQuery(scan);

/**
 * The calls query for the page address: a pressed phase (`?phase=`) becomes its steps
 * (`first`, `last`; a stretch without steps asks for none).
 */
export function callsParams(params: URLSearchParams, phase: ScanPhase | null): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('phase');
  if (phase) {
    next.set('first', String(phase.first_step ?? 0));
    next.set('last', String(phase.last_step ?? -1));
  }
  return next;
}

/** A call's phases and events, asked only once the call is opened. */
export const useSpanChildren = (span: string, open: boolean) => traceApi.useSpanChildrenQuery(span, { skip: !open });

export const useProcess = (scan: string) => traceApi.useScanProcessQuery(scan);
