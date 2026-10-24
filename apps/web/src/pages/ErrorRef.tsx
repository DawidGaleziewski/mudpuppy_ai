import { useParams } from 'react-router';
import { Callout, Code, Facts, LinkButton, PageHead, Plate, Stack, Text } from '../design-system';
import { QueryState } from '../app/QueryState';
import { api, read } from '../app/state/api';
import { Shell } from '../app/Shell';

interface ErrorEntry {
  ref: string;
  entry: { time?: string; step?: string | null; where?: string; conversation_id?: string | null; message?: string; detail?: unknown } | null;
  unavailable: boolean;
  start: string;
}

const errorsApi = api.injectEndpoints({
  endpoints: (b) => ({
    errorEntry: read<ErrorEntry, string>(b, (ref) => `/api/errors/${encodeURIComponent(ref)}`, (ref) => ['errors', ref]),
  }),
});

const useErrorEntry = (ref: string) => errorsApi.useErrorEntryQuery(ref);

function Entry({ e }: { e: ErrorEntry }) {
  const here = `/app/errors/${encodeURIComponent(e.ref)}`;
  if (e.unavailable)
    return (
      <Callout tone="failure" title="Assistant not running" live>
        <Stack>
          <Text block>The error log is read through the assistant service. Start it, then retry.</Text>
          <Code>{e.start}</Code>
          <LinkButton size="sm" href={here}>Retry</LinkButton>
        </Stack>
      </Callout>
    );
  const x = e.entry;
  if (!x)
    return (
      <Callout title={`No log entry for “${e.ref}”`}>
        The reference may be mistyped, or the entry was never written (the message then said so). Log files are kept for a limited time.
      </Callout>
    );
  return (
    <Stack>
      <Plate title="Entry">
        <Facts
          items={[
            ['Time (UTC)', <Text key="t" mono small>{x.time ?? ''}</Text>],
            ['Step', x.step ?? 'None (not tied to a workflow step)'],
            ['Where', <Text key="w" mono small>{x.where ?? ''}</Text>],
            ['Conversation', x.conversation_id ? <Text key="c" mono small>{x.conversation_id}</Text> : 'None'],
            ['Message', x.message ?? ''],
          ]}
        />
      </Plate>
      <Plate title="Detail">{x.detail === null || x.detail === undefined ? <Text muted>No detail was recorded.</Text> : <Code>{JSON.stringify(x.detail, null, 2)}</Code>}</Plate>
    </Stack>
  );
}

/** An error reference (ERR-…) from the assistant: its log line, for developers. */
export function ErrorRef() {
  const { ref = '' } = useParams();
  const q = useErrorEntry(ref);
  return (
    <Shell current="portals">
      <PageHead title={<>Error reference <Text mono>{ref}</Text></>} meta="For developers · read from the assistant's error log" />
      <QueryState query={q} what="the error log">
        {(e) => <Entry e={e} />}
      </QueryState>
    </Shell>
  );
}
