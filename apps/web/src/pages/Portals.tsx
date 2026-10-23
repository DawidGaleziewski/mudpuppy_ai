import { useQuery } from '@tanstack/react-query';
import { Callout, Count, LinkButton, PageHead, Plate, Row, Rows, ScanId, Stack, Status, Table, Tag, Text } from '../design-system';
import { getJson, usePortals, type NeedsItem, type PortalList, type StatusOut } from '../app/api';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';

interface PortalRow {
  portal: string;
  has_model: boolean;
  releases: { part: string; name: string; since: string }[];
  last_scan: { id: string; started_at: string; status: StatusOut; check: boolean; steps: number } | null;
  changes: number;
  needs: number;
  explained: number;
  review: number;
  processes: number;
  explored: number;
}

interface Overview {
  rows: PortalRow[];
  changes: number;
  review: number;
  preview: { portal: string; group: string; item: NeedsItem }[];
}

const useOverview = () => useQuery({ queryKey: ['portals', 'overview'], queryFn: () => getJson<Overview>('/api/portals/overview') });
const home = (p: string) => `/app/portals/${encodeURIComponent(p)}`;

const columns = [
  { header: 'Portal', rowHeader: true, cell: (r: PortalRow) => <Text href={home(r.portal)}>{r.portal}</Text> },
  {
    header: 'Release',
    cell: (r: PortalRow) =>
      r.releases.length ? (
        <Stack>
          {r.releases.map((x) => (
            <Text key={x.part} small>{`${x.part} · ${x.name || 'no marker'}`}</Text>
          ))}
        </Stack>
      ) : (
        <Text small muted>—</Text>
      ),
  },
  {
    header: 'Last scan',
    cell: (r: PortalRow) =>
      r.last_scan ? (
        <Stack>
          <ScanId id={r.last_scan.id} href={`/app/scans/${encodeURIComponent(r.last_scan.id)}`} tag />
          <ShownStatus status={r.last_scan.status} />
        </Stack>
      ) : (
        <Text small muted>none yet</Text>
      ),
  },
  { header: 'Changes', numeric: true, cell: (r: PortalRow) => r.changes },
  { header: 'Need you', numeric: true, cell: (r: PortalRow) => (r.needs ? <Count>{r.needs}</Count> : 0) },
  { header: 'In Review', numeric: true, cell: (r: PortalRow) => <Text href={`${home(r.portal)}/review`}>{String(r.review)}</Text> },
  { header: 'Processes explored', numeric: true, cell: (r: PortalRow) => `${String(r.explored)} / ${String(r.processes)}` },
];

function Preview({ o }: { o: Overview }) {
  return (
    <Plate title={<>Review across portals <Count muted>{o.review}</Count></>} flush={o.preview.length > 0}>
      {o.preview.length === 0 ? (
        <Callout>Nothing waits in Review on any portal.</Callout>
      ) : (
        <Rows label="Newest in Review">
          {o.preview.map(({ portal, group, item }) => (
            <Row key={`${portal}-${item.kind}-${item.id}`} aside={<Text mono small>{item.at}</Text>}>
              <Stack>
                <Text small muted>{`${portal} · ${group}`}</Text>
                <Text asIs href={`${home(portal)}/review`}>{item.claim}</Text>
                <ShownChip chip={item.chip} />
              </Stack>
            </Row>
          ))}
        </Rows>
      )}
    </Plate>
  );
}

function Environment({ list }: { list: PortalList }) {
  if (list.other_environments.length === 0) return null;
  return (
    <Plate title="Other environments">
      {list.other_environments.map((p) => (
        <Tag key={p} size="sm">
          {p}
        </Tag>
      ))}
    </Plate>
  );
}

/** All portals (designer v2-15): each portal's release, last scan, changes and what needs you, then Review across portals. */
export function Portals() {
  const q = usePortals();
  const o = useOverview();
  const data = q.data;
  return (
    <Shell current="portals">
      <PageHead
        title="Portals"
        meta={data ? `${String(data.portals.length)} portals · environment ${data.environment}` : undefined}
        actions={<LinkButton size="md" href="/app/portals/new">+ New portal</LinkButton>}
      />
      <QueryState query={q} what="the portals">
        {(list) => (
          <Stack>
            {list.portals.length === 0 ? (
              <Callout>No portal yet. Add one with + New portal.</Callout>
            ) : (
              <Plate title="This environment" flush>
                {o.data ? (
                  <Table caption="Portals of this environment" columns={columns} rows={o.data.rows} rowKey={(r) => r.portal} flush />
                ) : (
                  <Rows label="Portals">
                    {list.portals.map((p) => (
                      <Row key={p.id} aside={p.running > 0 ? <Status status="running">{`${String(p.running)} running`}</Status> : <Count muted>{p.scans}</Count>}>
                        <Text href={home(p.id)}>{p.id}</Text>
                      </Row>
                    ))}
                  </Rows>
                )}
              </Plate>
            )}
            {o.data && <Preview o={o.data} />}
            <Environment list={list} />
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
