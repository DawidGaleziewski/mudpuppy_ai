// A recorded screen (`web/api_state.py` over `queries_app_state.py` and `queries_app_state_side.py`),
// typed as the pydantic models declare them, and its amendment writes (`web/api_amendments.py`).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';
import type { Write } from './api-write';

export interface Box {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StateHead {
  id: string;
  portal: string;
  title: string;
  route: string;
  cluster: string;
  confidence: StatusOut;
  stabilization: string;
  first_seen_run: string;
  created_at: string;
  shot: string | null;
  wire: string | null;
  excalidraw: string | null;
  snapshot: string;
}

export interface EntryUrl {
  url: string;
  visits: number;
  via: string[];
  hops: { kind: string; status: number | null; url: string; reason: string | null }[];
}

export interface Param {
  name: string;
  where: string;
  values: (string | null)[];
  distinct: number;
  visits: number;
}

export interface Revision {
  state: string;
  rev: number;
  created_at: string;
  first_seen_run: string;
  runs: string[];
  personas: string[];
  latest: boolean;
}

export interface Outcome {
  probe: string;
  fault: string | null;
  target: string | null;
  status: StatusOut;
  accepted: boolean;
  possible_new_process: boolean;
  to_state: string | null;
  messages: { field: string | null; text: string; native: boolean }[];
  reason: string | null;
}

export interface FormStep {
  step: number;
  label: string;
  route: string;
  groups: [string, number][];
  /** Who marked it for probing, and when. */
  mark: [string, string] | null;
  states: { state: string; title: string; kind: StatusOut }[];
  outcomes: Outcome[];
}

export interface StatePage {
  head: StateHead;
  elements: Box[];
  element_count: number;
  urls: EntryUrl[];
  urls_more: number;
  params: Param[];
  revisions: Revision[];
  processes: { name: string; role: string }[];
  form_step: FormStep | null;
  citing: { key: string; title: string; portal: string; regions: string[] }[];
}

export interface Amendment {
  id: string;
  key: string;
  rev: number;
  status: StatusOut;
  state: 'active' | 'needs_reanchor' | 'dismissed' | 'withdrawn';
  text: string | null;
  author: string;
  created_at: string;
  attachment: string | null;
  element: string | null;
  other_state: string | null;
  history: { rev: number; change: string; text: string | null; author: string; created_at: string }[];
  pin: (Box & { n: number; note: string | null }) | null;
}

export interface SideBySide {
  left: { persona: string; state: string; shot: string | null; attributes: string | null };
  right: { persona: string; state: string; shot: string | null; attributes: string | null };
  only_left: string[];
  only_right: string[];
  text_differs: [string, string][];
  same: number;
}

export interface Access {
  reached: { persona: string; state: string; attributes: string | null; complete: boolean }[];
  not_reached: string[];
  reach_explained_by: string[];
  elements_total: number;
  elements: { key: string; seen_by: string[]; not_seen_by: string[]; explained_by: string[] }[];
  personas: string[];
  side_by_side: SideBySide | null;
}

export interface Amendments {
  items: Amendment[];
  /** (element key, readable label) the add form offers; empty: only the whole screen. */
  elements: [string, string][];
}

/** The model screen and variant a recording opens on (designer Q10). */
export interface RecordingPlace {
  portal: string;
  key: string;
  ordinal: number;
}

export interface StateView {
  page: StatePage;
  amendments: Amendments;
  access: Access | null;
  can_mark: boolean;
  place: RecordingPlace | null;
}

/** What the 1.x state page showed, on the Screen page: amendments, inputs, reached at. */
export interface ScreenRecordings {
  state: string;
  amendments: Amendments;
  inputs: FormStep[];
  urls: EntryUrl[];
  urls_more: number;
  params: Param[];
  can_mark: boolean;
}

/**
 * A recording's address: it opens in the dialog over its Screen page (designer Q10). Every old
 * `/states/{id}` link comes here, and this address sends it on.
 */
export const stateHref = (state: string) => `/app/states/${encodeURIComponent(state)}`;

/** The Screen page with a recording open. */
export const recordingHref = (p: RecordingPlace, state: string) =>
  `/app/portals/${encodeURIComponent(p.portal)}/screens/${encodeURIComponent(p.key)}?variant=r${String(p.ordinal)}&recording=${encodeURIComponent(state)}`;

export const stateKey = (state: string) => ['states', state] as const;

export const useScreenRecordings = (portal: string, key: string) =>
  useQuery({
    queryKey: ['portals', portal, 'screens', key, 'recordings'],
    queryFn: () => getJson<ScreenRecordings>(`/api/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}/recordings`),
    retry: false,
  });

/** A recording; `pair` (`left=…&right=…`) picks the two personas its Access shows side by side. */
export const useStateView = (state: string, pair = '') =>
  useQuery({
    queryKey: [...stateKey(state), pair],
    queryFn: () => getJson<StateView>(`/api/states/${encodeURIComponent(state)}${pair ? `?${pair}` : ''}`),
    placeholderData: keepPreviousData,
    enabled: state !== '',
  });

const amendmentsPath = (portal: string) => `/api/portals/${encodeURIComponent(portal)}/amendments`;

export const amendmentWrites = {
  add: (portal: string, body: { state_id: string; element: string; text: string; attachment?: { name: string; content_base64: string } }): Write => ({
    path: amendmentsPath(portal),
    body,
  }),
  edit: (portal: string, id: string, text: string, baseRev: number): Write => ({
    path: `${amendmentsPath(portal)}/${encodeURIComponent(id)}/edit`,
    body: { text, base_rev: baseRev },
  }),
  withdraw: (portal: string, id: string): Write => ({
    path: `${amendmentsPath(portal)}/${encodeURIComponent(id)}/withdraw`,
    body: {},
  }),
};
