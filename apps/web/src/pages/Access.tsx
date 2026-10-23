import { useParams } from 'react-router';
import { Callout, PageHead, Plate, Stack, Table, Text } from '../design-system';
import { useAccess, type AccessPage } from '../app/api-lists';
import { stateHref } from '../app/api-state';
import { QueryState } from '../app/QueryState';
import { ScreensViews } from '../app/ScreensViews';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

type Row = AccessPage['rows'][number];

function columns(a: AccessPage) {
  return [
    {
      header: 'Screen',
      rowHeader: true,
      cell: (r: Row) => (
        <Stack>
          <Text asIs {...(r.open ? { href: stateHref(r.open) } : {})}>{r.title}</Text>
          <Text route>{r.route}</Text>
        </Stack>
      ),
    },
    ...a.personas.map(([persona, attrs], i) => ({
      header: (
        <Stack>
          <Text asIs>{persona}</Text>
          <Text small muted asIs>{attrs ?? 'no attributes'}</Text>
        </Stack>
      ),
      cell: (r: Row) => {
        const cell = r.cells[i];
        if (!cell) return <Text muted>—</Text>;
        return (
          <Stack>
            <Text small href={stateHref(cell.state)}>Reached</Text>
            {!cell.complete && <Text small muted>trace only</Text>}
          </Stack>
        );
      },
    })),
    { header: 'Elements that differ', numeric: true, cell: (r: Row) => `${String(r.differ)} of ${String(r.total)}` },
    { header: 'Access', cell: (r: Row) => <ShownStatus status={r.status} /> },
  ];
}

/** Access by persona (spec 024 US2): which persona reached which screen, and where what they see differs. */
export function Access() {
  const { portal = '' } = useParams();
  const q = useAccess(portal);
  return (
    <Shell current="screens">
      <PageHead
        crumbs={[{ label: 'Screens', href: `/app/portals/${encodeURIComponent(portal)}/screens` }, { label: 'Access' }]}
        title="Access by persona"
        meta={q.data ? `${portal} · ${String(q.data.rows.length)} screens · ${String(q.data.personas.length)} personas` : undefined}
      />
      <ScreensViews portal={portal} current="access" />
      <QueryState query={q} what="who reaches which screen">
        {(a) => (
          <Stack>
            {a.budget_limited.length > 0 && (
              <Callout>{`${a.budget_limited.join(', ')} mapped only in scans that ran out of steps: a screen they did not reach may be beyond the budget, not out of reach.`}</Callout>
            )}
            <Plate flush>
              <Table
                caption={`Which persona reached which screen of ${a.portal}`}
                columns={columns(a)}
                rows={a.rows}
                rowKey={(r) => `${r.route}-${r.title}`}
                flush
                empty="No screens observed yet. Scan the portal as more than one persona; each screen then shows who reaches it."
              />
            </Plate>
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
