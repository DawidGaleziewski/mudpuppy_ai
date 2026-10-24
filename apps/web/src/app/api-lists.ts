// The smaller lists (`web/api_lists.py` over `queries_app_lists.py`): Access by persona, Server
// activity, Search and Scans by process, typed as the pydantic models declare them.
import type { StatusOut } from './api';
import { api, read } from './state/api';

export interface AccessPage {
  portal: string;
  /** Each persona with its attributes line (none: no attributes). */
  personas: [string, string | null][];
  rows: { title: string; route: string; open: string | null; cells: ({ state: string; complete: boolean } | null)[]; differ: number; total: number; status: StatusOut }[];
  budget_limited: string[];
}

export interface ActivityPage {
  total: number;
  calls: { tool: string; status: StatusOut; summary: string | null; rationale: string | null; duration_ms: number | null; started_at: string }[];
  next_cursor: string | null;
}

export interface SearchPage {
  q: string;
  portal: string | null;
  total: number;
  screens: { state: string; title: string; route: string }[];
  records: { key: string; title: string; kind: string; portal: string }[];
  scans: { id: string; portal: string; mode: string; status: StatusOut; started_at: string }[];
}

export interface GroupScan {
  id: string;
  persona: string;
  mode: string;
  status: StatusOut;
  screens: number;
  started_at: string;
}

export interface ScanGroupsPage {
  portal: string;
  processes: { key: string; title: string; scans: GroupScan[] }[];
  unassigned: GroupScan[];
  proposed: GroupScan[][];
}

const p = (portal: string) => `/api/portals/${encodeURIComponent(portal)}`;

const listsApi = api.injectEndpoints({
  endpoints: (b) => ({
    access: read<AccessPage, string>(b, (portal) => `${p(portal)}/access`, (portal) => ['portals', portal, 'access']),
    activity: read<ActivityPage, string | null>(
      b,
      (cursor) => `/api/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      (cursor) => ['activity', cursor],
    ),
    search: read<SearchPage, string>(b, (query) => `/api/search?${query}`, (query) => ['search', query]),
    scanGroups: read<ScanGroupsPage, string>(b, (portal) => `${p(portal)}/scans/by-process`, (portal) => ['portals', portal, 'scans', 'by-process']),
  }),
});

export const useAccess = (portal: string) => listsApi.useAccessQuery(portal);

export const useActivity = (cursor: string | null) => listsApi.useActivityQuery(cursor);

export const useSearch = (q: string, portal: string | null) =>
  listsApi.useSearchQuery(new URLSearchParams({ q, ...(portal ? { portal } : {}) }).toString());

export const useScanGroups = (portal: string) => listsApi.useScanGroupsQuery(portal);

/** Search, in one portal or all. */
export const searchHref = (q: string, portal?: string | null) =>
  `/app/search?${new URLSearchParams({ q, ...(portal ? { portal } : {}) }).toString()}`;
