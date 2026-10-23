import { useState, type ReactNode } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { Callout, Confirm, Text } from '../design-system';
import { useWrite, type Write } from './api-write';

/** A write the page offers: the question, what will happen, the confirming word and the call. */
export interface Ask {
  title: string;
  text: ReactNode;
  confirm: string;
  write: Write;
}

/**
 * Every write the same way (skill rule 8): `ask(…)` opens the confirm; on Confirm it posts, then
 * the answer shows as a live callout (with the conversation to follow, for a restart) and the
 * views under `refresh` reload. `view` is the dialog and the callout, placed where the page wants
 * the result read.
 */
export function useConfirmedWrite(refresh: QueryKey) {
  const [pending, setPending] = useState<Ask | null>(null);
  const write = useWrite(refresh);
  const result = write.data;
  const view = (
    <>
      <Confirm
        open={pending !== null}
        title={pending?.title ?? ''}
        confirmLabel={pending?.confirm ?? ''}
        busy={write.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) write.mutate(pending.write, { onSettled: () => setPending(null) });
        }}
      >
        {pending?.text}
      </Confirm>
      {result && (
        <Callout tone={result.ok ? 'ok' : 'failure'} live>
          {result.message}
          {result.href && (
            <>
              {' '}
              <Text href={result.href}>Open the conversation</Text>
            </>
          )}
        </Callout>
      )}
      {write.error && (
        <Callout tone="failure" live>
          The dashboard did not answer. Check that it runs (port 8765), then try again.
        </Callout>
      )}
    </>
  );
  return { ask: setPending, view };
}
