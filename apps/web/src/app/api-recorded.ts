// The recorded map and the Recorded pages (`web/api_recorded.py` over `queries_app_recorded*.py`),
// typed as the pydantic models declare them. The dashboard places every node, picks every edge's
// state and sends every word; the app renders them. Scan ids are whole (D-9).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type ChipOut, type StatusOut } from './api';
import type { Option } from './api-map';

export interface ScanChoice {
  id: string;
  persona: string;
  status: StatusOut;
  started_at: string;
}

export interface RecordedNode {
  id: string;
  /** `family`: a folded route family; opening it draws its pages. */
  kind: 'screen' | 'family';
  route: string;
  title: string;
  status: StatusOut;
  /** `data-state` (failed, unobserved); null when observed. */
  state: string | null;
  deck: boolean;
  kind_status: StatusOut | null;
  chips: ChipOut[];
  marked: boolean;
  first_state: string | null;
  states: number;
  near: string[];
  x: number;
  y: number;
  depth: number;
}

export interface RecordedEdge {
  state: string | null;
  d: string;
}

/** The recorded map's view, as the URL carries it. */
export interface RecordedFilter {
  scan: string;
  persona: string;
  /** null: the default layers; [] none ticked. */
  layers: string[] | null;
  open: string;
}

export interface RecordedMap {
  portal: string;
  has_model: boolean;
  /** The map's views when the portal has a model (this one is `path`); empty without one. */
  views: Option[];
  filter: { scan: string | null; persona: string | null; layers: string[]; open: string | null };
  layer_options: Option[];
  legend: Option[];
  node_legend: StatusOut[];
  scans: ScanChoice[];
  personas: string[];
  nodes: RecordedNode[];
  edges: RecordedEdge[];
  width: number;
  height: number;
  node_h: number;
  screens: number;
  transitions: number;
  queued: number;
  open_marks: number;
}

export interface RecordedMark {
  kind: string;
  label: string;
  hint: string;
  on: boolean;
  /** The state the mark goes on, or (when on) comes off. */
  state: string;
}

export interface RecordedNodeDetail {
  screen_id: string;
  route: string;
  title: string;
  first_state: string | null;
  states: { id: string; label: string; kind: StatusOut }[];
  scans: ScanChoice[];
  personas: string[];
  moves: { label: string; to_route: string; to_title: string; times: number; failed: boolean }[];
  items: { label: string; reason: string | null; status: StatusOut }[];
  outcomes: ChipOut[];
  marks: RecordedMark[];
  probe: { state: string; on: boolean } | null;
}

export interface RecordedPage {
  state: string;
  title: string;
  route: string;
  picture: string | null;
  confidence: StatusOut;
  probe_marked: boolean;
  probe: StatusOut | null;
  scans: number;
  personas: string[];
  last_seen: string | null;
}

export interface RecordedPages {
  portal: string;
  q: string;
  page: number;
  pages: number;
  total: number;
  every: number;
  rows: RecordedPage[];
  steps: number;
  steps_marked: number;
  steps_unprobed: number;
}

const base = (portal: string) => `/api/portals/${encodeURIComponent(portal)}`;

/** The query string of a recorded map view (`layers` repeated, an empty one for "none ticked"). */
export function recordedQuery(f: RecordedFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.scan) p.set('scan', f.scan);
  if (f.persona) p.set('persona', f.persona);
  if (f.open) p.set('open', f.open);
  if (f.layers !== null) for (const l of ['', ...f.layers]) p.append('layers', l);
  return p;
}

export const recordedMapKey = (portal: string) => ['portals', portal, 'map', 'recorded'] as const;

export const useRecordedMap = (portal: string, f: RecordedFilter) =>
  useQuery({
    queryKey: [...recordedMapKey(portal), f],
    queryFn: () => getJson<RecordedMap>(`${base(portal)}/map/recorded?${recordedQuery(f).toString()}`),
    placeholderData: keepPreviousData,
  });

export const useRecordedNode = (portal: string, screen: string) =>
  useQuery({
    queryKey: [...recordedMapKey(portal), 'node', screen],
    queryFn: () =>
      getJson<RecordedNodeDetail>(`${base(portal)}/map/recorded/${encodeURIComponent(screen)}`),
    enabled: screen !== '',
  });

export const useRecordedPages = (portal: string, q: string, page: number) =>
  useQuery({
    queryKey: ['portals', portal, 'screens', 'recorded', q, page],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (page > 1) p.set('page', String(page));
      const qs = p.toString();
      return getJson<RecordedPages>(`${base(portal)}/screens/recorded${qs ? `?${qs}` : ''}`);
    },
    placeholderData: keepPreviousData,
  });
