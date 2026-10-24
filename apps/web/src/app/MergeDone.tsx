import { useEffect, useState } from 'react';
import { Button, Callout, Text } from '../design-system';
import { writes } from './api-write';
import type { Ask } from './ConfirmedWrite';
import type { WriteResult } from './state/http';

/** How long a merge's Undo stays (designer T-06): then Split back on the process page. */
const UNDO_MS = 10_000;

/** A merge's answer, with Undo for 10 s (Undo asks first, as every write). */
export function MergeDone({ portal, result, ask }: { portal: string; result: WriteResult; ask: (a: Ask) => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setOpen(false), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [result]);
  const merge = result.undo;
  return (
    <Callout tone={result.ok ? 'ok' : 'failure'} live>
      {result.message}
      {result.href && (
        <>
          {' '}
          <Text href={result.href}>Open the process</Text>
        </>
      )}
      {merge && open && (
        <>
          {' '}
          <Button
            size="sm"
            variant="quiet"
            onClick={() => ask({ title: 'Undo the merge?', text: 'Both processes go back as they were; the absorbed one gets its to-be models back.', confirm: 'Undo', write: writes.unmerge(portal, merge) })}>
            Undo
          </Button>
        </>
      )}
    </Callout>
  );
}

/** Split back (designer T-06): later, from the process page, a merge is put back the same way. */
export function splitBackAsk(portal: string, merge: string, absorbed: string): Ask {
  return {
    title: `Split ${absorbed} back out?`,
    text: `${absorbed} becomes its own process again with its scope and as-is revisions, and its to-be models as they are now (edits since the merge included). This process gets an as-is revision without them.`,
    confirm: 'Split back',
    write: writes.unmerge(portal, merge),
  };
}
