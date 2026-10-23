import { Cluster, Code, Disclosure, Picture, Plate, Stack, Table, Tag, Text } from '../design-system';
import { useSection, type DocRow, type FormRow, type NetworkRow, type RobotsRow, type StateRow } from '../app/api-scan-tabs';
import { EvidenceRef } from '../app/EvidenceRef';
import { QueryState } from '../app/QueryState';
import { scanTabHref } from '../app/scanLinks';
import { CursorPager, useSectionParams } from '../app/SectionPaging';
import { ShownStatus } from '../app/ShownStatus';
import { stateHref } from './RecordedInspector';

const stateColumns = [
  {
    header: 'Picture',
    cell: (s: StateRow) => <Picture size="sm" shot={s.picture} title={s.title || '(untitled page)'} route={s.route} href={stateHref(s.state)} />,
  },
  {
    header: 'Title',
    rowHeader: true,
    cell: (s: StateRow) => (
      <Stack>
        <Text asIs href={stateHref(s.state)}>
          {s.title || '(untitled page)'}
        </Text>
        <Text route>{s.route}</Text>
      </Stack>
    ),
  },
  { header: 'Confidence', cell: (s: StateRow) => <ShownStatus status={s.confidence} /> },
  { header: 'Stabilization', cell: (s: StateRow) => s.stabilization },
  { header: 'Cluster', cell: (s: StateRow) => <Text mono small>{s.cluster}</Text> },
  { header: 'Evidence', cell: (s: StateRow) => <EvidenceRef e={s.evidence} /> },
  { header: 'Observed (UTC)', cell: (s: StateRow) => <Text mono small>{s.observed_at}</Text> },
];

export function StatesSection({ scan }: { scan: string }) {
  const q = useSection(scan, 'states', new URLSearchParams());
  return (
    <QueryState query={q} what="the screens observed">
      {(rows) => (
        <Plate title={`Screens observed · ${String(rows.length)}`} flush>
          <Table
            caption="Screens observed in this scan"
            columns={stateColumns}
            rows={rows}
            rowKey={(s) => `${s.state}-${s.observed_at}`}
            flush
            empty="No screens observed in this scan. The scan ended before the first page was recorded; the summary says why."
          />
        </Plate>
      )}
    </QueryState>
  );
}

function Fields({ f }: { f: FormRow }) {
  if (f.fields === null)
    return (
      <Disclosure summary="Fields">
        <Code>{f.raw ?? ''}</Code>
      </Disclosure>
    );
  return (
    <Cluster>
      {f.fields.map((fld, i) => (
        <Text key={i} small>
          <Text mono small>
            {fld.name}
          </Text>{' '}
          <Text muted small>{`${fld.type}${fld.required ? ' · required' : ''}`}</Text>
        </Text>
      ))}
    </Cluster>
  );
}

const formColumns = [
  { header: 'Fields', rowHeader: true, cell: (f: FormRow) => <Fields f={f} /> },
  {
    header: 'Screen',
    cell: (f: FormRow) => (
      <Text mono small href={stateHref(f.state)}>
        {f.state}
      </Text>
    ),
  },
  { header: 'Confidence', cell: (f: FormRow) => <ShownStatus status={f.confidence} /> },
  { header: 'Evidence', cell: (f: FormRow) => <EvidenceRef e={f.evidence} /> },
];

export function FormsSection({ scan }: { scan: string }) {
  const q = useSection(scan, 'forms', new URLSearchParams());
  return (
    <QueryState query={q} what="the forms">
      {(rows) => (
        <Plate title={`Forms · ${String(rows.length)}`} flush>
          <Table
            caption="Forms recorded in this scan"
            columns={formColumns}
            rows={rows}
            rowKey={(f) => f.id}
            flush
            empty="No forms recorded in this scan. Forms are recorded with their fields."
          />
        </Plate>
      )}
    </QueryState>
  );
}

function Shape({ label, text }: { label: string; text: string | null }) {
  if (text === null) return null;
  return (
    <Disclosure summary={label}>
      <Code>{text}</Code>
    </Disclosure>
  );
}

const networkColumns = [
  {
    header: 'Call',
    rowHeader: true,
    cell: (n: NetworkRow) => (
      <Stack>
        <Text route>{`${n.method} ${n.url_template}`}</Text>
        <Text small muted>
          {n.transition ? `transition ${n.transition}` : 'on screen load'}
        </Text>
      </Stack>
    ),
  },
  {
    header: 'Status',
    cell: (n: NetworkRow) => (
      <Cluster>
        <ShownStatus status={n.status} />
        <Text mono small>
          {n.code}
        </Text>
      </Cluster>
    ),
  },
  {
    header: 'Shapes',
    cell: (n: NetworkRow) => (
      <Stack>
        <Shape label="Request" text={n.request} />
        <Shape label="Response" text={n.response} />
      </Stack>
    ),
  },
  {
    header: 'Console errors',
    cell: (n: NetworkRow) =>
      n.console_errors ? <Shape label={`${String(n.errors)} errors`} text={n.console_errors} /> : <Text muted>None</Text>,
  },
];

export function NetworkSection({ scan }: { scan: string }) {
  const { params } = useSectionParams();
  const q = useSection(scan, 'network', params);
  return (
    <QueryState query={q} what="the network calls">
      {(d) => (
        <Stack>
          <Plate title={`Network call shapes · ${String(d.total)}`} flush>
            <Table
              caption="Network call shapes"
              columns={networkColumns}
              rows={d.items}
              rowKey={(n) => n.id}
              flush
              empty="No network calls recorded in this scan. Only request and response shapes are stored."
            />
          </Plate>
          <CursorPager total={d.total} nextCursor={d.next_cursor} />
        </Stack>
      )}
    </QueryState>
  );
}

const robotsColumns = [
  {
    header: 'Host',
    rowHeader: true,
    cell: (p: RobotsRow) => (
      <Stack>
        <Text>{p.host}</Text>
        <Text mono small>
          {p.url}
        </Text>
      </Stack>
    ),
  },
  {
    header: 'Outcome',
    cell: (p: RobotsRow) => (
      <Cluster>
        <ShownStatus status={p.outcome} />
        {p.http_status !== null && <Text small>{`HTTP ${String(p.http_status)}`}</Text>}
        {p.truncated && (
          <Text small muted>
            truncated
          </Text>
        )}
      </Cluster>
    ),
  },
  { header: 'Group', cell: (p: RobotsRow) => `${p.group ?? '—'} as ${p.product_token}` },
  { header: 'Crawl delay', numeric: true, cell: (p: RobotsRow) => (p.crawl_delay_s === null ? '—' : `${String(p.crawl_delay_s)}s`) },
  { header: 'Fetched (UTC)', cell: (p: RobotsRow) => <Text mono small>{p.fetched_at}</Text> },
  { header: 'Evidence', cell: (p: RobotsRow) => <EvidenceRef e={p.evidence} /> },
];

export function RobotsSection({ scan }: { scan: string }) {
  const q = useSection(scan, 'robots', new URLSearchParams());
  return (
    <QueryState query={q} what="the robots.txt policies">
      {(rows) => (
        <Plate title={`robots.txt policies · ${String(rows.length)}`} flush>
          <Table
            caption="robots.txt policies"
            columns={robotsColumns}
            rows={rows}
            rowKey={(p) => `${p.host}-${p.fetched_at}`}
            flush
            empty="No robots.txt fetched in this scan. The policy is fetched per host before the first page loads, unless the portal ignores robots.txt."
          />
        </Plate>
      )}
    </QueryState>
  );
}

function docColumns(scan: string) {
  const tabHref = (tab: string) => scanTabHref(scan, tab);
  return [
    {
      header: 'Record',
      rowHeader: true,
      cell: (r: DocRow) => (
        <Stack>
          <Cluster>
            <Tag size="sm" href={`/docs/${encodeURIComponent(r.portal)}/${encodeURIComponent(r.key)}`}>
              {r.key}
            </Tag>
            <Text asIs>{r.title}</Text>
          </Cluster>
          <Cluster>
            <Text small muted>
              {r.kind}
            </Text>
            <Tag size="sm">{`rev ${String(r.rev)}`}</Tag>
          </Cluster>
        </Stack>
      ),
    },
    { header: 'Status', cell: (r: DocRow) => <ShownStatus status={r.status} /> },
    { header: 'Confidence', cell: (r: DocRow) => <ShownStatus status={r.confidence} /> },
    {
      header: 'Cites',
      cell: (r: DocRow) => (
        <Stack>
          {r.cites.map((c, i) => (
            <Text key={i} small>
              {c.tab ? <Text href={tabHref(c.tab)}>{`${c.kind} ${c.id}`}</Text> : `${c.kind} ${c.id}`}
              {c.note ? ` · ${c.note}` : ''}
            </Text>
          ))}
        </Stack>
      ),
    },
  ];
}

export function DocsSection({ scan }: { scan: string }) {
  const { params } = useSectionParams();
  const q = useSection(scan, 'docs', params);
  return (
    <QueryState query={q} what="the documentation citing this scan">
      {(d) => (
        <Stack>
          <Plate title={`Documentation citing this scan · ${String(d.total)}`} flush>
            <Table
              caption="Records whose latest revision cites this scan"
              columns={docColumns(scan)}
              rows={d.items}
              rowKey={(r) => r.key}
              flush
              empty="No documentation cites this scan. Records appear here once the BA agent cites this scan's screens, actions, forms, calls or decisions as evidence."
            />
          </Plate>
          <CursorPager total={d.total} nextCursor={d.next_cursor} />
        </Stack>
      )}
    </QueryState>
  );
}
