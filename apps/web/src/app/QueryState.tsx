import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Busy, Callout, Skeleton } from '../design-system';

/** What a failed read says: the dashboard's message (RTK Query's `ApiFailure`), else a fallback. */
function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return 'The request failed.';
}

/** A load under this shows no loading state at all; once shown, the skeleton stays this long (designer T-10 Q7.3). */
export const LOADING_DELAY_MS = 300;

/**
 * Whether the skeleton shows (designer T-10, D-75): not before 300 ms of loading, and once shown
 * for at least 300 ms, so it never flashes.
 */
export function useShownLoading(loading: boolean): boolean {
  const [shown, setShown] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (loading && !shown) {
      const t = setTimeout(() => {
        since.current = Date.now();
        setShown(true);
      }, LOADING_DELAY_MS);
      return () => clearTimeout(t);
    }
    if (!loading && shown) {
      const t = setTimeout(() => setShown(false), Math.max(0, LOADING_DELAY_MS - (Date.now() - since.current)));
      return () => clearTimeout(t);
    }
    return undefined;
  }, [loading, shown]);
  return shown;
}

/** Something on its way with nothing to show yet (the first page's code): the skeleton after 300 ms. */
export function Pending({ what }: { what: string }) {
  return useShownLoading(true) ? <Skeleton label={`Loading ${what}`} /> : null;
}

/**
 * A page head's data line (designer T-14, FE-V45): the line itself while the data loads (a grey
 * line of its height, `null`), its text once there, nothing after an error. Never inserted later.
 */
export function headMeta<T>(q: { data?: T | undefined; isLoading: boolean }, line: (d: T) => ReactNode): ReactNode {
  if (q.data !== undefined) return line(q.data);
  return q.isLoading ? null : undefined;
}

/** A graph's body while it loads (designer T-10): its box at the embedded height, 520 px. */
export function GraphSkeleton() {
  return <Skeleton.Block height={520} />;
}

interface Read<T> {
  data?: T | undefined;
  /** The result for the current arguments; undefined while a new filter or page is read. */
  currentData?: unknown;
  isLoading: boolean;
  isFetching?: boolean;
  error?: unknown;
}

/**
 * The loading and error states every page shows the same way (designer T-10, FE-V40, FE-V41):
 * nothing for the first 300 ms, then the page's `skeleton` at its final size with the loader
 * naming what loads; a list read again with new arguments keeps its rows, dimmed, "Updating"; an
 * error takes the skeleton's place. Once the data is there, `children` gets it, so a page never
 * asserts that it exists. `query` is an RTK Query hook's result.
 */
export function QueryState<T>({ query, what, skeleton, children }: { query: Read<T>; what: string; skeleton?: ReactNode; children: (data: T) => ReactNode }) {
  const { data, isLoading, error } = query;
  const shown = useShownLoading(isLoading);
  if (shown || isLoading) return shown ? <Skeleton label={`Loading ${what}`}>{skeleton}</Skeleton> : null;
  if (error !== undefined || data === undefined)
    return (
      <Callout tone="failure" title={`Could not load ${what}`} live>
        {messageOf(error)} Check that the dashboard runs (port 8765), then reload.
      </Callout>
    );
  const again = query.isFetching === true && 'currentData' in query && query.currentData === undefined;
  return <Busy busy={again}>{children(data)}</Busy>;
}
