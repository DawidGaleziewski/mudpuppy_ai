import type { ReactNode } from 'react';
import { Callout, Text } from '../design-system';
import { ApiError } from './api';

/**
 * The loading and error states every page shows the same way (skill rule 6): loading says what
 * it loads, an error gives the message and the next move.
 */
export function QueryState({
  loading,
  error,
  what,
  children,
}: {
  loading: boolean;
  error: unknown;
  what: string;
  children: () => ReactNode;
}) {
  if (loading)
    return (
      <div role="status">
        <Text block muted>
          Loading {what}…
        </Text>
      </div>
    );
  if (error) {
    const message =
      error instanceof ApiError || error instanceof Error ? error.message : 'The request failed.';
    return (
      <Callout tone="failure" title={`Could not load ${what}`} live>
        {message} Check that the dashboard runs (port 8765), then reload.
      </Callout>
    );
  }
  return <>{children()}</>;
}
