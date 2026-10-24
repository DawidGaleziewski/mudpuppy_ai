// The console's one RTK Query API (spec 076, skill frontend-architecture § 3): every read of the
// dashboard's JSON API is an endpoint injected per domain (`api-*.ts`), every write the `write`
// mutation. The base query is `getJson`'s: the chosen data store (`?store=`) and As of
// (`?as_of=`) go on every request, a failed one is an `ApiError` with the dashboard's message.
//
// Tags: an endpoint provides one tag per prefix of its key (`['portals', p, 'processes', …]` →
// `portals`, `portals/p`, `portals/p/processes`, …), and a write invalidates the prefix it names
// (`processesKey(portal)`), so a write reloads exactly the views under it.

import { useState } from 'react';
import { createApi, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import { ApiError, getJson, postJson, type Write, type WriteResult } from './http';

/** What a failed request leaves in `error`: its status and the dashboard's message. */
export interface ApiFailure {
  status: number;
  message: string;
}

/** A GET of a path (the store and As of added by `getJson`). */
const dashboardQuery: BaseQueryFn<string, unknown, ApiFailure> = async (path) => {
  try {
    return { data: await getJson<unknown>(path) };
  } catch (error) {
    if (error instanceof ApiError) return { error: { status: error.status, message: error.message } };
    return { error: { status: 0, message: error instanceof Error ? error.message : 'The request failed.' } };
  }
};

/** One segment of a key as a tag id piece (objects and filters by their JSON). */
const piece = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v ?? null));

/** The tag id of a key prefix. */
export const tagId = (key: readonly unknown[]): string => key.map(piece).join('/');

/** The tags of a key: one per prefix, so invalidating any prefix reaches it. */
export function keyTags(key: readonly unknown[]): { type: 'Key'; id: string }[] {
  return key.map((_, i) => ({ type: 'Key' as const, id: tagId(key.slice(0, i + 1)) }));
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: dashboardQuery,
  tagTypes: ['Key'],
  // a page opened again reads again, as before (the store changes under it: scans run)
  refetchOnMountOrArgChange: true,
  endpoints: (b) => ({
    /** Every write (skill mudpuppy-react-ui rule 8): posted, its answer kept, `refresh` reloaded. */
    write: b.mutation<WriteResult, { write: Write; refresh: readonly unknown[] }>({
      queryFn: async ({ write }) => ({ data: await postJson(write) }),
      invalidatesTags: (_r, _e, { refresh }) => [{ type: 'Key', id: tagId(refresh) }],
    }),
  }),
});

/** The endpoint builder `injectEndpoints` hands each domain's module. */
export type Build = Parameters<Parameters<typeof api.injectEndpoints>[0]['endpoints']>[0];

/** A read endpoint: the API path and the key (whose prefixes are its tags) from its argument. */
export const read = <T, A>(b: Build, path: (arg: A) => string, key: (arg: A) => readonly unknown[]) =>
  b.query<T, A>({ query: path, providesTags: (_r, _e, arg) => keyTags(key(arg)) });

/**
 * A read that polls while its data says something runs (a scan): `ms` then, nothing otherwise.
 * The interval follows the last answer, adjusted during render (no effect, no extra pass).
 */
export function useLive<A, T, R extends { data?: T | undefined }>(
  useEndpoint: (arg: A, options: { pollingInterval: number; skip: boolean }) => R,
  arg: A,
  live: (data: T) => boolean,
  ms: number,
  skip = false,
): R {
  const [interval, setInterval] = useState(0);
  const result = useEndpoint(arg, { pollingInterval: interval, skip });
  const want = result.data !== undefined && live(result.data) ? ms : 0;
  if (want !== interval) setInterval(want);
  return result;
}

/** Reload every view under a key (a stream said the store changed). */
export const invalidateKey = (key: readonly unknown[]) => api.util.invalidateTags([{ type: 'Key', id: tagId(key) }]);
