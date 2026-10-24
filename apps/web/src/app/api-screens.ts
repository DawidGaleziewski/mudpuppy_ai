// The Screens API (`web/api_screens.py` over `queries_app_screens.py`): the model's screens and
// one screen, typed as the pydantic models declare them.
import type { ChipOut, NeedsItem, StatusOut } from './api';
import { api, read } from './state/api';

export interface ScreenOut {
  key: string;
  title: string;
  route: string;
  status: StatusOut;
  /** Changes on it that need a person. */
  needs: number;
  variants: number;
  /** The distinct whys of its variants as chips (Unknown dashed), the baseline left out. */
  why: ChipOut[];
  last_seen: string | null;
  last_run: string | null;
  /** Actions seen working, of `actions`, on `release`. */
  checked: number;
  actions: number;
  release: string | null;
  parts: string[];
  process: { key: string; name: string } | null;
  /** The main variant's latest recording, on the list only (designer T-03); none recorded: null. */
  /** `thumb`: the screenshot's small WebP the row loads (spec 079); the dialog shows `shot`. */
  picture?: { shot: string | null; wire: string | null; thumb?: string | null } | null;
}

/** The list's filters, as the URL carries them (empty: not set). */
export interface ScreenFilter {
  status: string;
  q: string;
  process: string;
  part: string;
  why: string;
  sort: string;
}

export interface ScreensData {
  portal: string;
  /** False: the portal has no model yet, only recorded pages. */
  has_model: boolean;
  counts: Record<string, number>;
  parts: string[];
  whys: string[];
  sorts: { value: string; label: string }[];
  screens: ScreenOut[];
}

export interface VariantOut {
  ordinal: number;
  state_id: string;
  title: string;
  picture: { shot: string | null; wire: string | null; scans: number } | null;
  /** The why with what it names ("Release 5696", "Baseline"). */
  reason: string;
  reason_chip: 'dashed' | null;
  explanation: string;
  status: StatusOut;
  first_seen: string | null;
  last_seen: string | null;
  visits: number;
  personas: string[];
  releases: string[];
}

export interface ActionOut {
  element_key: string;
  kind: string;
  status: StatusOut;
  /** On every page: a menu, a footer. */
  is_global: boolean;
  /** Where it goes: stays inside the screen (or no page), out to another screen, or the menu on every page. */
  place: 'inside' | 'out' | 'menu';
  /** `key` null: no page; equal to the screen's own key: it stays inside. */
  /** `note`: what happened instead of an ordinary move ("no change"); null when it worked. */
  leads_to: { key: string | null; title: string | null; note: string | null }[];
}

export interface ScreenDetailData {
  portal: string;
  screen: ScreenOut;
  needs: NeedsItem[];
  variants: VariantOut[];
  actions: ActionOut[];
  history: { id: string; chip: ChipOut; status: StatusOut; finding: string; model_seq: number; created_at: string }[];
  /** Answers to "same screen?" about its page versions. */
  labels: { a: string; b: string; answer: string; by: string; at: string; reason: string | null }[];
}

const base = (portal: string) => `/api/portals/${encodeURIComponent(portal)}/screens`;

/** The list's filter as an address carries it (the Screens page's own, or a screen's `list=`). */
export function screenFilter(params: URLSearchParams): ScreenFilter {
  const get = (k: keyof ScreenFilter) => params.get(k) ?? '';
  return { status: get('status'), q: get('q'), process: get('process'), part: get('part'), why: get('why'), sort: get('sort') };
}

const screensApi = api.injectEndpoints({
  endpoints: (b) => ({
    // a new filter keeps the old rows on screen until its rows arrive (RTK Query's `data`)
    screens: read<ScreensData, { portal: string; f: ScreenFilter }>(
      b,
      ({ portal, f }) => `${base(portal)}?${new URLSearchParams({ ...f }).toString()}`,
      ({ portal, f }) => ['portals', portal, 'screens', f],
    ),
    screen: read<ScreenDetailData, { portal: string; key: string }>(
      b,
      ({ portal, key }) => `${base(portal)}/${encodeURIComponent(key)}`,
      ({ portal, key }) => ['portals', portal, 'screens', key],
    ),
  }),
});

/** `enabled` false: not asked (a screen opened from elsewhere has no list to walk). */
export const useScreens = (portal: string, f: ScreenFilter, enabled = true) =>
  screensApi.useScreensQuery({ portal, f }, { skip: !enabled });

export const useScreen = (portal: string, key: string) => screensApi.useScreenQuery({ portal, key });

/** One screen while a picture dialog shows it (its variants); none: not asked. */
export const useScreenIf = (portal: string, key: string | null) => screensApi.useScreenQuery({ portal, key: key ?? '' }, { skip: key === null });
