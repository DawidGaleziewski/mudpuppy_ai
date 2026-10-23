// The smaller lists (`web/api_lists.py` over `queries_app_lists.py`): Access by persona, Server
// activity, Search and Scans by process, typed as the pydantic models declare them.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';

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

export const useAccess = (portal: string) =>
  useQuery({ queryKey: ['portals', portal, 'access'], queryFn: () => getJson<AccessPage>(`${p(portal)}/access`) });

export const useActivity = (cursor: string | null) =>
  useQuery({
    queryKey: ['activity', cursor],
    queryFn: () => getJson<ActivityPage>(`/api/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
    placeholderData: keepPreviousData,
  });

export const useSearch = (q: string, portal: string | null) => {
  const query = new URLSearchParams({ q, ...(portal ? { portal } : {}) }).toString();
  return useQuery({ queryKey: ['search', query], queryFn: () => getJson<SearchPage>(`/api/search?${query}`), placeholderData: keepPreviousData });
};

export const useScanGroups = (portal: string) =>
  useQuery({ queryKey: ['portals', portal, 'scans', 'by-process'], queryFn: () => getJson<ScanGroupsPage>(`${p(portal)}/scans/by-process`) });

/** Search, in one portal or all. */
export const searchHref = (q: string, portal?: string | null) =>
  `/app/search?${new URLSearchParams({ q, ...(portal ? { portal } : {}) }).toString()}`;
