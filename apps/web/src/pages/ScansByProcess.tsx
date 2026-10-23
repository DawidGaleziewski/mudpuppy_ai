import { useParams } from 'react-router';
import { Callout, Count, PageHead, Plate, ScanId, Stack, SubHead, Table, Tag, Text } from '../design-system';
import { useScanGroups, type GroupScan } from '../app/api-lists';
import { QueryState } from '../app/QueryState';
import { ScansViews } from '../app/ScansViews';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

function Scans({ scans, caption }: { scans: GroupScan[]; caption: string }) {
  return (
    <Table
      caption={caption}
      dense
      flush
      rows={scans}
      rowKey={(s) => s.id}
      columns={[
        { header: 'Status', cell: (s) => <ShownStatus status={s.status} /> },
        { header: 'Scan', rowHeader: true, cell: (s) => <ScanId id={s.id} href={`/app/scans/${encodeURIComponent(s.id)}`} tag /> },
        { header: 'Persona', cell: (s) => s.persona },
        { header: 'Mode', cell: (s) => s.mode },
        { header: 'Screens', numeric: true, cell: (s) => s.screens },
        { header: 'Started (UTC)', cell: (s) => <Text mono small>{s.started_at}</Text> },
      ]}
    />
  );
}

/** Scans by process (spec 034 R-70 (1)): which scans belong to which documented process, the ones in none, and groups that look like one. */
export function ScansByProcess() {
  const { portal = '' } = useParams();
  const q = useScanGroups(portal);
  const base = `/app/portals/${encodeURIComponent(portal)}`;
  return (
    <Shell current="scans">
      <PageHead
        crumbs={[{ label: 'Scans', href: `${base}/scans` }, { label: 'By process' }]}
        title="Scans by process"
        meta={`${portal} · a scan belongs to a documented process when the process's documentation cites it, or when it walked at least two of the process's screens (error pages don't count).`}
      />
      <ScansViews portal={portal} current="by-process" />
      <QueryState query={q} what="the scans by process">
        {(g) => (
          <Stack>
            {g.processes.length === 0 && <Callout>No documented process yet. When the BA documents a process (or you create one in Processes), its scans are grouped here.</Callout>}
            {g.processes.map((p) => (
              <Plate key={p.key} title={<><Tag size="sm" href={p.key.startsWith('PRC-') ? `${base}/processes/${encodeURIComponent(p.key)}` : `${base}/docs/${encodeURIComponent(p.key)}`}>{p.key}</Tag> <Text asIs>{p.title}</Text> <Count muted>{p.scans.length}</Count></>} flush>
                {p.scans.length ? <Scans scans={p.scans} caption={`Scans of ${p.key}`} /> : <Text muted>No scan walked this process&apos;s screens yet.</Text>}
              </Plate>
            ))}
            <Plate title={<>In no process <Count muted>{g.unassigned.length}</Count></>} flush>
              {g.unassigned.length ? (
                <Stack>
                  <Text small muted>These scans walked no documented process. They are kept, not forgotten: ask the BA to document them, or group them below.</Text>
                  <Scans scans={g.unassigned} caption="Scans in no process" />
                </Stack>
              ) : (
                <Text muted>Every scan belongs to a documented process.</Text>
              )}
            </Plate>
            {g.proposed.length > 0 && (
              <Plate title={<>Look like one process <Count muted>{g.proposed.length}</Count></>} flush>
                <Stack>
                  <Text small muted>Scans in no process that share at least half of their screens. Each group is likely one process nobody documented yet.</Text>
                  {g.proposed.map((scans, i) => (
                    <Stack key={i}>
                      <SubHead>{`Group ${String(i + 1)}`}</SubHead>
                      <Scans scans={scans} caption={`Proposed group ${String(i + 1)}`} />
                    </Stack>
                  ))}
                </Stack>
              </Plate>
            )}
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
