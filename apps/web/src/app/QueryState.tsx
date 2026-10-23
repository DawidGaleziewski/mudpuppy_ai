import type { ReactNode } from 'react';
import { Callout, State } from '../design-system';
import { ApiError } from './api';

/**
 * The loading and error states every page shows the same way (skill rule 6): loading says what
 * it loads, an error gives the message and the next move. Once the data is there, `children`
 * gets it, so a page never asserts that it exists.
 */
export function QueryState<T>({
  query,
  what,
  children,
}: {
  query: { data: T | undefined; isPending: boolean; error: unknown };
  what: string;
  children: (data: T) => ReactNode;
}) {
  const { data, isPending: loading, error } = query;
  // the designer's caret state, in the page's body only: the head and the frame stay (R-103 (5))
  if (loading) return <State loading title={`Reading ${what}`} />;
  if (error || data === undefined) {
    const message =
      error instanceof ApiError || error instanceof Error ? error.message : 'The request failed.';
    return (
      <Callout tone="failure" title={`Could not load ${what}`} live>
        {message} Check that the dashboard runs (port 8765), then reload.
      </Callout>
    );
  }
  return <>{children(data)}</>;
}
