import { useState, type ReactNode } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { Button, Callout, Confirm, Text } from '../design-system';
import { useWrite, type Write, type WriteResult } from './api-write';

/** A write the page offers: the question, what will happen, the confirming word and the call. */
export interface Ask {
  title: string;
  text: ReactNode;
  confirm: string;
  write: Write;
  /** The link's word when the answer says where to follow it up (a restart: the conversation). */
  follow?: string;
  /** Run after a write that was recorded (Edit first: open the new process at once). */
  onDone?: (result: WriteResult) => void;
  /** A decision that can be taken back: the ask its answer's Undo opens (Review, D-1@062). */
  undo?: (decision: string) => Ask;
}

/**
 * Every write the same way (skill rule 8): `ask(…)` opens the confirm; on Confirm it posts, then
 * the answer shows as a live callout (with the conversation to follow, for a restart) and the
 * views under `refresh` reload. `view` is the dialog and the callout, placed where the page wants
 * the result read.
 */
export function useConfirmedWrite(refresh: QueryKey) {
  const [pending, setPending] = useState<Ask | null>(null);
  const [follow, setFollow] = useState('Open the conversation');
  const [undoAsk, setUndoAsk] = useState<Ask['undo']>(undefined);
  const write = useWrite(refresh);
  const result = write.data;
  const undo = result?.ok && result.undo && undoAsk ? undoAsk(result.undo) : null;
  const view = (
    <>
      <Confirm
        open={pending !== null}
        title={pending?.title ?? ''}
        confirmLabel={pending?.confirm ?? ''}
        busy={write.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          setFollow(pending.follow ?? 'Open the conversation');
          setUndoAsk(() => pending.undo);
          const { onDone } = pending;
          write.mutate(pending.write, {
            onSettled: () => setPending(null),
            onSuccess: (r) => {
              if (r.ok) onDone?.(r);
            },
          });
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
              <Text href={result.href}>{follow}</Text>
            </>
          )}
          {undo && (
            <>
              {' '}
              <Button data-review-key="u" size="sm" variant="quiet" onClick={() => setPending(undo)}>
                Undo
              </Button>
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
