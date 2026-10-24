import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Callout, Cluster, Columns, Count, Diagram, Field, PageHead, Plate, Row, Rows, Select, Stack, SubHead, Table, Tag, Tags, Text } from '../design-system';
import { docsHref, useDocs, type DocRecordRow, type DocsFilters, type DocsPage, type DocsView } from '../app/api-docs';
import type { Option } from '../app/api-review';
import { QueryState } from '../app/QueryState';
import { CursorPager, useSectionParams } from '../app/SectionPaging';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';
import { CapabilityMap } from './DocsCapabilities';

/** The SRS sections with their record counts, the one shown marked. */
function Index({ page }: { page: DocsPage }) {
  return (
    <Plate title="Sections" flush>
      <Rows label="Documentation sections">
        {page.sections.map((s) => (
          <Row key={s.id} current={s.id === page.section.id} aside={<Count muted>{s.count}</Count>}>
            <Text href={docsHref(page.portal, { section: s.id })}>{s.label}</Text>
          </Row>
        ))}
      </Rows>
    </Plate>
  );
}

function Overview({ page }: { page: DocsPage }) {
  if (!page.statuses.length && !page.sessions.length) {
    return <Callout>{`Nothing documented for ${page.portal} yet. Start an analysis session with the BA agent; its records and sessions appear here as they are written.`}</Callout>;
  }
  return (
    <Stack>
      <Text block>{`Documentation of ${page.portal} reconstructed from recorded scan evidence. Every statement cites evidence; anything the crawler could not observe is marked Not observed and has an open question.`}</Text>
      <Cluster>
        {page.statuses.map((s) => (
          <Cluster key={s.status.word}>
            <Text mono>{String(s.count)}</Text>
            <ShownStatus status={s.status} />
          </Cluster>
        ))}
      </Cluster>
      <Table
        caption="Records by section"
        columns={[
          { header: 'Section', cell: (s) => <Text href={docsHref(page.portal, { section: s.id })}>{s.label}</Text>, rowHeader: true },
          { header: 'Records', cell: (s) => s.count, numeric: true },
        ]}
        rows={page.counts}
        rowKey={(s) => s.id}
        dense
      />
      <SubHead>Analysis sessions</SubHead>
      <Table
        caption="Analysis sessions"
        columns={[
          { header: 'Session', cell: (s) => <Tag size="sm" href={s.href} title={s.id}>{s.short}</Tag>, rowHeader: true },
          { header: 'Status', cell: (s) => <ShownStatus status={s.status} /> },
          { header: 'Started (UTC)', cell: (s) => <Text mono small>{s.started_at}</Text> },
          { header: 'Summary', cell: (s) => s.summary ?? '—' },
        ]}
        rows={page.sessions}
        rowKey={(s) => s.id}
        empty="No session recorded."
      />
    </Stack>
  );
}

function Choice({ label, value, options, any, onChange }: { label: string; value: string; options: readonly Option[]; any: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** The section's filters, applied on the button (a select never navigates on change). */
function Filters({ f }: { f: DocsFilters }) {
  const { params, setParams } = useFilterParams();
  const [kind, setKind] = useState(f.kind ?? '');
  const [status, setStatus] = useState(f.status ?? '');
  const [confidence, setConfidence] = useState(f.confidence ?? '');
  const [flag, setFlag] = useState(f.flag ?? '');
  const apply = () => setParams({ section: params.get('section') ?? undefined, kind, status, confidence, flag });
  const active = f.kind || f.status || f.confidence || f.flag;
  return (
    <Cluster>
      {f.kinds.length > 0 && <Choice label="Kind" value={kind} options={f.kinds} any="Every kind" onChange={setKind} />}
      <Choice label="Status" value={status} options={f.statuses} any="Any status" onChange={setStatus} />
      <Choice label="Confidence" value={confidence} options={f.confidences} any="Any confidence" onChange={setConfidence} />
      <Choice label="Flag" value={flag} options={f.flags} any="No flag" onChange={setFlag} />
      <Button size="md" onClick={apply}>
        Filter
      </Button>
      {active && (
        <Button size="md" variant="quiet" onClick={() => setParams({ section: params.get('section') ?? undefined })}>
          Clear filters
        </Button>
      )}
    </Cluster>
  );
}

/** Filters live in the page address; a new filter starts at the first page again. */
function useFilterParams() {
  const { params } = useSectionParams();
  const portal = useParams().portal ?? '';
  const navigate = useNavigate();
  const setParams = (v: DocsView) => void navigate(docsHref(portal, v));
  return { params, setParams };
}

function recordCell(r: DocRecordRow, withKind: boolean) {
  return (
    <Stack>
      <Cluster>
        <Tag size="sm" href={r.href}>
          {r.key}
        </Tag>
        <Text asIs>{r.title}</Text>
      </Cluster>
      {withKind && <Text small muted>{r.kind}</Text>}
      {r.summary && <Text small muted>{r.summary}</Text>}
    </Stack>
  );
}

function notes(r: DocRecordRow) {
  return (
    <Cluster>
      {r.not_observable && <ShownStatus status={r.not_observable} />}
      {r.followup && <ShownStatus status={r.followup} />}
      {r.blocked_reason && <Text small>{r.blocked_reason}</Text>}
      {r.confirmed_rev !== null && <Text small muted>{`confirmed at rev ${String(r.confirmed_rev)}`}</Text>}
    </Cluster>
  );
}

function RecordTable({ page }: { page: DocsPage }) {
  const r = page.records;
  if (!r) return null;
  const f = r.filters;
  const filtered = f.kind || f.status || f.confidence || f.flag;
  const empty = filtered ? `No ${page.section.label.toLowerCase()} match these filters. Clear a filter to see more.` : `No ${page.section.label.toLowerCase()} documented yet. Records appear here once the BA agent has written them from the recorded scans.`;
  const common = [
    { header: 'Record', cell: (x: DocRecordRow) => recordCell(x, r.matrix || f.kinds.length > 0), rowHeader: true },
    { header: 'Status', cell: (x: DocRecordRow) => <ShownStatus status={x.status} /> },
    { header: 'Confidence', cell: (x: DocRecordRow) => <ShownStatus status={x.confidence} /> },
  ];
  const columns = r.matrix
    ? [
        ...common,
        { header: 'Evidence', cell: (x: DocRecordRow) => x.evidence, numeric: true },
        { header: 'Scans', cell: (x: DocRecordRow) => x.scans, numeric: true },
        {
          header: 'Linked records',
          cell: (x: DocRecordRow) =>
            x.related.length ? (
              <Tags>
                {x.related.map((k) => (
                  <Tag key={k} size="sm">
                    {k}
                  </Tag>
                ))}
              </Tags>
            ) : (
              <Text muted>None</Text>
            ),
        },
      ]
    : [...common, { header: 'Rev', cell: (x: DocRecordRow) => x.rev, numeric: true }, { header: 'Notes', cell: notes }];
  return (
    <Stack>
      <Table caption={page.section.label} columns={columns} rows={r.items} rowKey={(x) => x.key} empty={empty} />
      <CursorPager total={r.total} nextCursor={r.next_cursor} />
    </Stack>
  );
}

function Section({ page }: { page: DocsPage }) {
  const r = page.records;
  return (
    <Plate title={page.section.label} actions={r ? <Count muted>{r.total}</Count> : undefined}>
      {r ? (
        <Stack>
          <Filters key={JSON.stringify(r.filters)} f={r.filters} />
          {(page.capabilities ?? []).length > 0 && <CapabilityMap page={page} />}
          {page.diagram && !(page.capabilities ?? []).length && <Diagram source={page.diagram.source} caption={page.diagram.caption} />}
          <RecordTable page={page} />
        </Stack>
      ) : (
        <Overview page={page} />
      )}
    </Plate>
  );
}

/** A portal's documentation (spec 004 R-15): the SRS sections, one shown with its records. */
export function Docs() {
  const portal = useParams().portal ?? '';
  const { params } = useSectionParams();
  const get = (k: string) => params.get(k) ?? undefined;
  const view: DocsView = { section: get('section'), kind: get('kind'), status: get('status'), confidence: get('confidence'), flag: get('flag'), cursor: get('cursor') };
  const q = useDocs(portal, view);
  return (
    <Shell current="docs">
      <PageHead crumbs={[{ label: 'Portals', href: '/app/' }, { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` }, { label: 'Docs' }]} title={`${portal} documentation`} meta="Read-only: the BA agent writes it from the recorded scans; a person reviews each record." />
      <QueryState query={q} what="the documentation">
        {(page) => <Columns main={<Section page={page} />} side={<Index page={page} />} />}
      </QueryState>
    </Shell>
  );
}
