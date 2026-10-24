// The model map API (`web/api_map.py` over `queries_app_map.py`), typed as the pydantic models
// declare it. The dashboard places every node and draws every edge; the app renders them.
import type { ChipOut, StatusOut } from './api';
import { api, read } from './state/api';

export interface MapNode {
  id: string;
  /** SC-… for a screen; a folded family's route. */
  key: string;
  /** `family`: a folded route family; opening it draws its screens. */
  kind: 'screen' | 'family';
  route: string;
  title: string;
  retired: boolean;
  status: StatusOut;
  /** Its own actions that stay on it. */
  actions: number;
  /** "2 actions inside", the chip on its box. */
  inside: ChipOut;
  /** Screens of a family. */
  count: number;
  chips: ChipOut[];
  /** "Step 2" when the overlaid process walks it, "Trigger" where it starts. */
  role: string | null;
  /** Outside the overlay, or unchanged since the previous release. */
  dim: boolean;
  near: string[];
  x: number;
  y: number;
  depth: number;
}

export interface MapEdge {
  state: string | null;
  d: string;
  label: string;
  label_x: number;
  label_y: number;
}

export interface OutLink {
  to_key: string | null;
  to_title: string;
  /** null: active (the ordinary case says nothing). */
  status: StatusOut | null;
  label: string;
  /** The condition a decision rule takes it on ("age ≥ 18"). */
  rule: string;
}

export interface Option {
  value: string;
  label: string;
}

/** The map's view, as the URL carries it. */
export interface MapFilter {
  view: string;
  /** null: the default layers; [] none ticked. */
  layers: string[] | null;
  process: string;
  open: string;
}

export interface MapData {
  portal: string;
  has_model: boolean;
  filter: { view: string; layers: string[]; process: string | null; open: string | null };
  views: Option[];
  layer_options: Option[];
  legend: Option[];
  processes: { key: string; name: string }[];
  overlay: { key: string; name: string } | null;
  nodes: MapNode[];
  edges: MapEdge[];
  width: number;
  height: number;
  node_h: number;
  screens: number;
  links: number;
  bundled: number;
  bundled_drawn: string[];
  since: number | null;
  changed: number;
  out_links: Record<string, OutLink[]>;
}

/** The query string of a map view (`layers` repeated, an empty one for "none ticked"). */
export function mapQuery(f: MapFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.view && f.view !== 'now') p.set('view', f.view);
  if (f.process) p.set('process', f.process);
  if (f.open) p.set('open', f.open);
  if (f.layers !== null) for (const l of ['', ...f.layers]) p.append('layers', l);
  return p;
}

const mapApi = api.injectEndpoints({
  endpoints: (b) => ({
    // a new view keeps the old drawing on screen until its drawing arrives (RTK Query's `data`)
    map: read<MapData, { portal: string; f: MapFilter }>(
      b,
      ({ portal, f }) => `/api/portals/${encodeURIComponent(portal)}/map?${mapQuery(f).toString()}`,
      ({ portal, f }) => ['portals', portal, 'map', f],
    ),
  }),
});

export const useMap = (portal: string, f: MapFilter) => mapApi.useMapQuery({ portal, f });
