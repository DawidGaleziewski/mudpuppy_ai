import type { ReactNode } from 'react';
import { Callout, State } from '../design-system';

/** What a failed read says: the dashboard's message (RTK Query's `ApiFailure`), else a fallback. */
function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return 'The request failed.';
}

/**
 * The loading and error states every page shows the same way (skill rule 6): loading says what
 * it loads, an error gives the message and the next move. Once the data is there, `children`
 * gets it, so a page never asserts that it exists. `query` is an RTK Query hook's result.
 */
export function QueryState<T>({
  query,
  what,
  children,
}: {
  query: { data?: T | undefined; isLoading: boolean; error?: unknown };
  what: string;
  children: (data: T) => ReactNode;
}) {
  const { data, isLoading, error } = query;
  // the designer's caret state, in the page's body only: the head and the frame stay (R-103 (5))
  if (isLoading) return <State loading title={`Reading ${what}`} />;
  if (error !== undefined || data === undefined)
    return (
      <Callout tone="failure" title={`Could not load ${what}`} live>
        {messageOf(error)} Check that the dashboard runs (port 8765), then reload.
      </Callout>
    );
  return <>{children(data)}</>;
}
