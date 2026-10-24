import { useParams } from 'react-router';
import { LinkButton, Meter, PageHead, Plate, ScanId, shortScanId, Stack, Table, Text } from '../design-system';
import { useScans, type ScanSummary } from '../app/api';
import { planHref } from '../app/api-plan';
import { ScansViews } from '../app/ScansViews';
import { headMeta, QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

const columns = (ids: readonly string[]) => [
  {
    header: 'Scan',
    cell: (s: ScanSummary) => <ScanId id={s.id} siblings={ids} href={`/app/scans/${encodeURIComponent(s.id)}`} copy />,
    rowHeader: true,
  },
  { header: 'Persona', cell: (s: ScanSummary) => s.persona },
  { header: 'Kind', cell: (s: ScanSummary) => s.mode },
  { header: 'Status', cell: (s: ScanSummary) => <ShownStatus status={s.status} /> },
  { header: 'Steps', cell: (s: ScanSummary) => (s.max_steps ? `${String(s.steps_used)} / ${String(s.max_steps)}` : s.steps_used), numeric: true },
  { header: 'Started (UTC)', cell: (s: ScanSummary) => <Text mono>{s.started_at}</Text> },
];

/** A portal's scans: a running one's progress first, then the newest 25 (R-96). */
export function Scans() {
  const portal = useParams().portal ?? '';
  const q = useScans(portal);
  const running = q.data?.scans.filter((s) => s.status.shape === 'running') ?? [];
  const ids = q.data?.scans.map((s) => s.id) ?? [];
  return (
    <Shell current="scans">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          { label: 'Scans' },
        ]}
        title="Scans"
        meta={headMeta(q, (d) => `${String(d.total)} scans · ${String(running.length)} running`)}
        actions={<LinkButton size="md" href={planHref(portal)}>Plan next scan</LinkButton>}
      />
      <ScansViews portal={portal} current="all" />
      <QueryState query={q} what="the scans">
        {(list) => (
          <Stack>
            {running.map((s) => (
              <Plate key={s.id} title="Running now" label={`${s.kind} ${shortScanId(s.id, ids)}`}>
                <Meter
                  label={`${s.kind} ${shortScanId(s.id, ids)}`}
                  value={s.steps_used}
                  max={s.max_steps ?? Math.max(s.steps_used, 1)}
                  detail={`${String(s.steps_used)} / ${String(s.max_steps ?? '?')} steps`}
                />
              </Plate>
            ))}
            <Plate title="Newest scans" flush>
              <Table
                caption={`Scans of ${portal}`}
                columns={columns(ids)}
                rows={list.scans}
                rowKey={(s) => s.id}
                flush
                empty="No scans yet. Start one from the chat."
              />
            </Plate>
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
