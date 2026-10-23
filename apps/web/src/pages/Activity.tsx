import { useParams, useSearchParams } from 'react-router';
import { Cluster, LinkButton, PageHead, Plate, Stack, Table, Text } from '../design-system';
import { useActivity } from '../app/api-lists';
import { QueryState } from '../app/QueryState';
import { ScansViews } from '../app/ScansViews';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

function ms(n: number | null): string {
  if (n === null) return '—';
  return n < 1000 ? `${String(n)} ms` : `${(n / 1000).toFixed(1)} s`;
}

/** Server activity (FR-016): tool calls made outside any scan, newest first, read-only. */
export function Activity() {
  const { portal = '' } = useParams();
  const [params] = useSearchParams();
  const cursor = params.get('cursor');
  const q = useActivity(cursor);
  const base = `/app/portals/${encodeURIComponent(portal)}/scans`;
  return (
    <Shell current="scans">
      <PageHead crumbs={[{ label: 'Scans', href: base }, { label: 'Server activity' }]} title="Server activity" meta="Tool calls made outside any scan (FR-016) · read-only" />
      <ScansViews portal={portal} current="activity" />
      <QueryState query={q} what="the server activity">
        {(a) => (
          <Plate title={`Calls outside a scan · ${String(a.total)}`} flush>
            <Stack>
              <Table
                caption="Tool calls outside a scan, newest first"
                flush
                rows={a.calls}
                rowKey={(c) => `${c.started_at}-${c.tool}`}
                empty="No calls outside a scan. Every tool call so far happened inside a scan."
                columns={[
                  { header: 'Tool', rowHeader: true, cell: (c) => <Text mono small>{c.tool}</Text> },
                  { header: 'Status', cell: (c) => <ShownStatus status={c.status} /> },
                  { header: 'Summary', cell: (c) => c.summary ?? '—' },
                  { header: 'Rationale', cell: (c) => (c.rationale ? <Text small>{`Agent-stated: ${c.rationale}`}</Text> : <Text muted>—</Text>) },
                  { header: 'Duration', numeric: true, cell: (c) => ms(c.duration_ms) },
                  { header: 'Started (UTC)', cell: (c) => <Text mono small>{c.started_at}</Text> },
                ]}
              />
              <Cluster>
                {cursor && <LinkButton size="sm" href={`${base}/activity`}>First page</LinkButton>}
                {a.next_cursor && <LinkButton size="sm" href={`${base}/activity?cursor=${encodeURIComponent(a.next_cursor)}`}>Next page</LinkButton>}
              </Cluster>
            </Stack>
          </Plate>
        )}
      </QueryState>
    </Shell>
  );
}
