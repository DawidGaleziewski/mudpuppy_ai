import { useParams } from 'react-router';
import { Meter, PageHead, Plate, Stack, Table, Tag, Text } from '../design-system';
import { useScans, type ScanSummary } from '../app/api';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

const columns = [
  { header: 'Scan', cell: (s: ScanSummary) => <Tag size="sm">{s.id}</Tag>, rowHeader: true },
  { header: 'Persona', cell: (s: ScanSummary) => s.persona },
  { header: 'Kind', cell: (s: ScanSummary) => s.mode },
  { header: 'Status', cell: (s: ScanSummary) => <ShownStatus status={s.status} /> },
  { header: 'Steps', cell: (s: ScanSummary) => (s.max_steps ? `${String(s.steps_used)} / ${String(s.max_steps)}` : s.steps_used), numeric: true },
  { header: 'Started (UTC)', cell: (s: ScanSummary) => <Text mono>{s.started_at}</Text> },
];

/** A portal's scans: a running one's progress first, then the newest 25 (the htmx Scans page, R-96). */
export function Scans() {
  const portal = useParams().portal ?? '';
  const q = useScans(portal);
  const running = q.data?.scans.filter((s) => s.status.shape === 'running') ?? [];
  return (
    <Shell current="scans">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          { label: 'Scans' },
        ]}
        title="Scans"
        meta={q.data ? `${String(q.data.total)} scans · ${String(running.length)} running` : undefined}
      />
      <QueryState loading={q.isPending} error={q.error} what="the scans">
        {() => (
          <Stack>
            {running.map((s) => (
              <Plate key={s.id} title="Running now" label={`Scan ${s.id}`}>
                <Meter
                  label={`Scan ${s.id}`}
                  value={s.steps_used}
                  max={s.max_steps ?? Math.max(s.steps_used, 1)}
                  detail={`${String(s.steps_used)} / ${String(s.max_steps ?? '?')} steps`}
                />
              </Plate>
            ))}
            <Plate title="Newest scans" flush>
              <Table
                caption={`Scans of ${portal}`}
                columns={columns}
                rows={q.data!.scans}
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
