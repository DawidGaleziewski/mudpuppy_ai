// A scan's Trace and Process (`web/api_scan_trace.py` over `queries_app_trace*.py`), typed as the
// pydantic models declare them.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';
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

export const useTraceSummary = (scan: string) =>
  useQuery({ queryKey: ['scans', scan, 'trace', 'summary'], queryFn: () => getJson<TraceSummary>(`${base(scan)}/trace/summary`) });

/** One page of calls, asked with the page address's filters and cursor. */
export function useTraceCalls(scan: string, params: URLSearchParams) {
  const qs = params.toString();
  return useQuery({
    queryKey: ['scans', scan, 'trace', qs],
    queryFn: () => getJson<TraceCalls>(`${base(scan)}/trace${qs ? `?${qs}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

/** A call's phases and events, asked only once the call is opened. */
export const useSpanChildren = (span: string, open: boolean) =>
  useQuery({
    queryKey: ['spans', span, 'children'],
    queryFn: () => getJson<SpanChildren>(`/api/spans/${encodeURIComponent(span)}/children`),
    enabled: open,
  });

export const useProcess = (scan: string) =>
  useQuery({ queryKey: ['scans', scan, 'process'], queryFn: () => getJson<ProcessTab>(`${base(scan)}/process`) });
