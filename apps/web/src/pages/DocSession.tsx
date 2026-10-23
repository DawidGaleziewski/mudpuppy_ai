import { useParams } from 'react-router';
import { Cluster, Facts, PageHead, Plate, Stack, Table, Tag, Text } from '../design-system';
import { useDocSession, type DocSessionPage } from '../app/api-doc';
import { docsHref } from '../app/api-docs';
import { QueryState } from '../app/QueryState';
import { CursorPager, useSectionParams } from '../app/SectionPaging';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

function Body({ s }: { s: DocSessionPage }) {
  return (
    <Stack>
      <Session s={s} />
      <Scans s={s} />
      <Passes s={s} />
      <WrittenRecords s={s} />
      <Gaps s={s} />
    </Stack>
  );
}

function Session({ s }: { s: DocSessionPage }) {
  return (
    <Plate title="Session" actions={<ShownStatus status={s.status} />}>
      <Stack>
        <Facts
          items={[
            ['Id', <Text key="id" mono small>{s.id}</Text>],
            ['Portal', <Text key="p" href={docsHref(s.portal)}>{s.portal}</Text>],
            ['Started (UTC)', <Text key="s" mono small>{s.started_at}</Text>],
            ['Ended (UTC)', <Text key="e" mono small>{s.ended_at ?? '—'}</Text>],
          ]}
        />
        {s.summary && <Text block>{s.summary}</Text>}
      </Stack>
    </Plate>
  );
}

function Scans({ s }: { s: DocSessionPage }) {
  return (
    <Plate title={`Input scans · ${String(s.scans.length)}`} flush={s.scans.length > 0}>
      {s.scans.length ? (
        <Table
          caption="Scans this session read"
          columns={[
            { header: 'Scan', rowHeader: true, cell: (r) => <Tag size="sm" href={r.scan.href} {...(r.scan.title ? { title: r.scan.title } : {})}>{r.scan.label}</Tag> },
            { header: 'Mode', cell: (r) => r.mode },
            { header: 'Persona', cell: (r) => r.persona },
            { header: 'Status', cell: (r) => <ShownStatus status={r.status} /> },
            { header: 'Started (UTC)', cell: (r) => <Text mono small>{r.started_at}</Text> },
          ]}
          rows={s.scans}
          rowKey={(r) => r.scan.href}
          flush
        />
      ) : (
        <Text small muted>No input scans recorded. A session lists the scans it read when it starts.</Text>
      )}
    </Plate>
  );
}

function Passes({ s }: { s: DocSessionPage }) {
  return (
    <Plate title={`Passes · ${String(s.passes.length)}`} flush={s.passes.length > 0}>
      {s.passes.length ? (
        <Table
          caption="Analysis passes completed"
          columns={[
            { header: 'Pass', rowHeader: true, cell: (p) => p.name },
            { header: 'Summary', cell: (p) => p.summary ?? '—' },
            { header: 'Completed (UTC)', cell: (p) => <Text mono small>{p.completed_at ?? '—'}</Text> },
          ]}
          rows={s.passes}
          rowKey={(p) => `${p.name}|${p.completed_at ?? ''}`}
          flush
        />
      ) : (
        <Text small muted>No pass completed yet. The seven passes are recorded as the BA finishes them.</Text>
      )}
    </Plate>
  );
}

function WrittenRecords({ s }: { s: DocSessionPage }) {
  return (
    <Plate title={`Records written · ${String(s.written_total)}`}>
      {s.written.length ? (
        <Stack>
          <Table
            caption="Records this session created or revised"
            columns={[
              {
                header: 'Record',
                rowHeader: true,
                cell: (w) => (
                  <Cluster>
                    <Tag size="sm" href={w.href}>
                      {w.key}
                    </Tag>
                    <Text asIs>{w.title}</Text>
                  </Cluster>
                ),
              },
              { header: 'Change', cell: (w) => w.change },
              { header: 'Status now', cell: (w) => <ShownStatus status={w.status} /> },
              { header: 'Confidence', cell: (w) => <ShownStatus status={w.confidence} /> },
            ]}
            rows={s.written}
            rowKey={(w) => w.key}
          />
          <CursorPager total={s.written_total} nextCursor={s.next_cursor} />
        </Stack>
      ) : (
        <Text small muted>This session has written no record. Creates and revisions made in this session are listed here.</Text>
      )}
    </Plate>
  );
}

function Gaps({ s }: { s: DocSessionPage }) {
  return (
    <Plate title={`Gaps · ${String(s.gaps.length)}`}>
      {s.gaps.length ? (
        <Stack>
          {s.gaps.map((g) => (
            <Text key={g} block>
              {g}
            </Text>
          ))}
        </Stack>
      ) : (
        <Text small muted>No gaps reported. What was not observable or skipped is listed here when the session ends.</Text>
      )}
    </Plate>
  );
}

/** One analysis session of the BA agent: what it read, did, wrote and could not see. */
export function DocSession() {
  const { portal = '', session = '' } = useParams();
  const { params } = useSectionParams();
  const q = useDocSession(portal, session, params.get('cursor'));
  return (
    <Shell current="docs">
      <PageHead crumbs={[{ label: 'Portals', href: '/app/' }, { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` }, { label: 'Docs', href: docsHref(portal) }, { label: 'Session' }]} title="Analysis session" meta={q.data?.summary ? undefined : session} />
      <QueryState query={q} what="the session">
        {(s) => <Body s={s} />}
      </QueryState>
    </Shell>
  );
}
