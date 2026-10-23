// One scan's page (`web/api_scan.py` over `queries_app_scan.py`): its head and its graph, typed as
// the pydantic models declare them. Scan ids are whole (D-9).
import { useQuery } from '@tanstack/react-query';
import { getJson, type ChipOut, type StatusOut } from './api';
import type { Option } from './api-map';
import type { RecordedEdge } from './api-recorded';

export interface ScanHead {
  id: string;
  portal: string;
  persona: string;
  status: StatusOut;
  warning: string | null;
  facts: { label: string; value: string }[];
  tabs: { id: string; label: string; count: number }[];
  needs_attention: boolean;
  /** The portal hooks that ran in it (spec 023 US2.3). */
  hooks?: { point: string; fn: string; runs: number; outcomes: Record<string, number>; pages_patched: number }[];
}

export interface ScanFailure {
  transition: string;
  label: string;
  error: string;
  at: string;
}

export interface ScanNode {
  id: string;
  route: string;
  title: string;
  status: StatusOut;
  state: string | null;
  /** The state this scan saw last on the screen: where Start here goes. */
  state_id: string;
  order: number;
  failures: ScanFailure[];
  queued: number;
  unreachable: number;
  blocked: number;
  stopped_here: boolean;
  chips: ChipOut[];
  near: string[];
  x: number;
  y: number;
}

export interface ScanGraph {
  scan: string;
  recovery: {
    status: StatusOut;
    stopped: boolean;
    persona: string;
    environment: string;
    warning: string | null;
    steps: number;
    queued: number;
  };
  nodes: ScanNode[];
  edges: RecordedEdge[];
  width: number;
  height: number;
  node_h: number;
  stop_node: string | null;
  /** The node the page opens on: where it stopped, else the first that failed. */
  open_node: string | null;
  path: string[];
  failures: number;
  failed_moves: number;
  unreachable: number;
  variations: Option[];
  legend: StatusOut[];
  edge_legend: Option[];
}

const base = (scan: string) => `/api/scans/${encodeURIComponent(scan)}`;

export const scanKey = (scan: string) => ['scans', scan] as const;

export const useScanHead = (scan: string) =>
  useQuery({ queryKey: [...scanKey(scan), 'head'], queryFn: () => getJson<ScanHead>(base(scan)) });

export const useScanGraph = (scan: string) =>
  useQuery({ queryKey: [...scanKey(scan), 'graph'], queryFn: () => getJson<ScanGraph>(`${base(scan)}/graph`) });
