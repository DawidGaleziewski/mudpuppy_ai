import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Callout, Cluster, Facts, Field, Input, LinkButton, PageHead, Plate, Releases, Select, shortScanId, Split, Stack, SubHead, Table, Tag, Text, ViewNav } from '../design-system';
import { changeHref, changesHref, useChanges, type ChangeRow, type ChangeScreenGroup, type ChangesPage, type ChangesView } from '../app/api-changes';
import { processHref } from '../app/api-processes';
import { reviewHref } from '../app/api-review';
import { plural } from '../app/plural';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';

const screenHref = (portal: string, key: string) => `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}`;

/** From and To as model versions: the previous release, the first scan or a version. */
function RangeForm({ page }: { page: ChangesPage }) {
  const r = page.range;
  const navigate = useNavigate();
  const chosen = r?.how === 'release' ? '' : String(r?.from_seq ?? 0);
  const [from, setFrom] = useState(chosen);
  const [to, setTo] = useState(String(r?.to_seq ?? ''));
  if (!r) return null;
  return (
    <Cluster>
      <Field label="From" help="Changes first seen after this point. A model version is built after each scan.">
        <Select value={from} onChange={(e) => setFrom(e.target.value)}>
          {r.froms.map((o) => (
            <option key={`${o.value}-${o.label}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To">
        <Select value={to} onChange={(e) => setTo(e.target.value)}>
          {r.tos.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button size="md" onClick={() => void navigate(changesHref(page.portal, { from_seq: from === '' ? undefined : from, to_seq: to }))}>
        Show
      </Button>
    </Cluster>
  );
}

/** Or from a date, or from a scan (12-v2-ux § 2): each its own choice, so one wins. */
function FromOther({ page }: { page: ChangesPage }) {
  const r = page.range;
  const navigate = useNavigate();
  const [date, setDate] = useState(r?.from_date ?? '');
  const [scan, setScan] = useState(r?.from_scan || r?.scans[0]?.value || '');
  if (!r) return null;
  const to = String(r.to_seq ?? '');
  return (
    <Cluster>
      <Field label="Or from a date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Button size="md" disabled={!date} onClick={() => void navigate(changesHref(page.portal, { from_date: date, to_seq: to }))}>
        From this date
      </Button>
      {r.scans.length > 0 && (
        <>
          <Field label="Or from a scan">
            <Select value={scan} onChange={(e) => setScan(e.target.value)}>
              {r.scans.map((o) => (
                <option key={o.value} value={o.value}>
                  {`${shortScanId(o.value)} · ${o.label}`}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="md" onClick={() => void navigate(changesHref(page.portal, { from_scan: scan, to_seq: to }))}>
            From this scan
          </Button>
        </>
      )}
    </Cluster>
  );
}

function Range({ page }: { page: ChangesPage }) {
  const rel = page.releases;
  const range = rel && rel.range_left !== null && rel.range_width !== null ? { left: rel.range_left, width: rel.range_width, label: rel.range_label } : null;
  return (
    <Plate title="Range">
      <Stack>
        <RangeForm key={`${String(page.range?.from_seq)}-${String(page.range?.to_seq)}`} page={page} />
        <FromOther page={page} />
        {rel && (
          <Releases
            lanes={rel.lanes}
            scans={rel.scans.map((s) => ({ ...s, href: `/app/scans/${encodeURIComponent(s.id)}` }))}
            axis={rel.axis}
            start={rel.start}
            end={rel.end}
            range={range}
          />
        )}
        {rel && rel.lanes.length === 0 && (
          <Text small muted>
            No release was told apart yet: without a release marker, changes are found by comparing pages. Ask the assistant to add the marker;{' '}
            <Text href={`/portals/${encodeURIComponent(page.portal)}/settings#hints`}>Settings ▸ Hints</Text> shows it.
          </Text>
        )}
      </Stack>
    </Plate>
  );
}

function Filters({ page, view }: { page: ChangesPage; view: ChangesView }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState(page.kind ?? '');
  const [process, setProcess] = useState(page.process ?? '');
  const keep = { from_seq: view.from_seq, to_seq: view.to_seq, from_date: view.from_date, from_scan: view.from_scan };
  const filtered = { kind: page.kind ?? undefined, process: page.process ?? undefined };
  const c = page.counts;
  const shows = [
    ['needs', 'Needs you', c.needs],
    ['explained', 'Explained automatically', c.explained],
    ['all', 'All', c.all],
  ] as const;
  return (
    <Cluster>
      <ViewNav
        label="Show"
        items={shows.map(([show, label, count]) => ({ href: changesHref(page.portal, { ...keep, ...filtered, show }), label, count, current: page.show === show }))}
      />
      <Field label="Kind">
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Any kind</option>
          {page.kinds.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Process">
        <Select value={process} onChange={(e) => setProcess(e.target.value)}>
          <option value="">All processes</option>
          {page.processes.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button size="md" onClick={() => void navigate(changesHref(page.portal, { ...keep, show: page.show, kind: kind || undefined, process: process || undefined }))}>
        Filter
      </Button>
      {(page.kind || page.process) && <Text href={changesHref(page.portal, { ...keep, show: page.show })}>Clear filters</Text>}
    </Cluster>
  );
}

function changeColumns(portal: string) {
  return [
    {
      header: 'Change · evidence',
      rowHeader: true,
      cell: (ch: ChangeRow) => (
        <Stack>
          <Cluster>
            <ShownChip chip={ch.word} />
            {ch.hypothesis_key && <Tag size="sm">{ch.hypothesis_key}</Tag>}
          </Cluster>
          <Text asIs>{ch.finding}</Text>
          <Text mono small muted>{`model version ${String(ch.model_seq)} · ${ch.at}${ch.element_key ? ` · ${ch.element_key}` : ''}`}</Text>
        </Stack>
      ),
    },
    {
      header: 'Explanation',
      cell: (ch: ChangeRow) => (
        <Stack>
          <ShownChip chip={ch.explanation} />
          <Text small muted>{`${ch.explanation_text}${ch.reason ? ` ${ch.reason}` : ''}`}</Text>
        </Stack>
      ),
    },
    { header: 'Status', cell: (ch: ChangeRow) => <ShownStatus status={ch.status} /> },
    { header: 'Open', cell: (ch: ChangeRow) => <Text small href={changeHref(portal, ch.id)}>Before / after</Text> },
  ];
}

function ScreenChanges({ portal, s }: { portal: string; s: ChangeScreenGroup }) {
  return (
    <Stack>
      <Split>
        <Cluster>
          {s.key && (
            <Tag size="sm" href={screenHref(portal, s.key)}>
              {s.key}
            </Tag>
          )}
          <Text asIs>{s.title}</Text>
          {s.route && <Text route>{s.route}</Text>}
        </Cluster>
        <Text small muted>{`${plural(s.count, 'change')}${s.needs ? ` · ${String(s.needs)} need${s.needs === 1 ? 's' : ''} you` : ''}`}</Text>
      </Split>
      <Table caption={`Changes on ${s.title}`} columns={changeColumns(portal)} rows={s.changes} rowKey={(ch) => ch.id} dense />
    </Stack>
  );
}

function Groups({ page }: { page: ChangesPage }) {
  if (!page.groups.length) {
    const nothingNeeds = page.show === 'needs' && page.counts.all > 0;
    return (
      <Plate>
        {nothingNeeds ? (
          <Callout tone="ok">
            Nothing needs you: every change in this range was explained automatically. <Text href={changesHref(page.portal, { show: 'explained' })}>See them</Text> (reviewing is optional).
          </Callout>
        ) : (
          <Text small muted>{`No change in this range${page.kind || page.process ? ' with these filters' : ''}. Changes start after the second scan.`}</Text>
        )}
      </Plate>
    );
  }
  return (
    <Stack>
      {page.groups.map((g) => (
        <Plate
          key={g.key ?? 'none'}
          title={
            <Cluster>
              {g.key ? <Text href={processHref(page.portal, g.key)}>{g.name}</Text> : <Text>{g.name}</Text>}
              {g.key && <Tag size="sm">{g.key}</Tag>}
            </Cluster>
          }
          actions={<Text small muted>{`${plural(g.count, 'change')} · ${String(g.needs)} need${g.needs === 1 ? 's' : ''} you · ${String(g.count - g.needs)} explained`}</Text>}
        >
          <Stack>
            {g.screens.map((s) => (
              <ScreenChanges key={s.key ?? 'portal'} portal={page.portal} s={s} />
            ))}
          </Stack>
        </Plate>
      ))}
    </Stack>
  );
}

function Legend({ page }: { page: ChangesPage }) {
  if (!page.legend.length) return null;
  return (
    <Plate
      title="Explanations"
      actions={
        <Cluster>
          {page.statuses.map((s) => (
            <ShownStatus key={s.word} status={s} />
          ))}
        </Cluster>
      }
    >
      <Facts items={page.legend.map((l) => [<ShownChip key={l.chip.word} chip={l.chip} />, `${l.text} ${String(l.count)} in this range.`] as const)} />
    </Plate>
  );
}

function Body({ page, view }: { page: ChangesPage; view: ChangesView }) {
  if (!page.has_model) {
    return (
      <Callout>
        {page.portal} has no portal model yet. It is built after every scan, or with <Text mono>{`pnpm model:reconcile ${page.portal}`}</Text>.
      </Callout>
    );
  }
  return (
    <Stack>
      <Range page={page} />
      <SubHead section>{plural(page.shown, 'change')}</SubHead>
      <Text small muted>
        Grouped by process, then screen. In each group, what needs you comes first.
      </Text>
      <Filters page={page} view={view} />
      <Groups page={page} />
      <Legend page={page} />
    </Stack>
  );
}

/** What changed (designer screen v2-02): the portal model's changes in a range, by process and screen. */
export function Changes() {
  const portal = useParams().portal ?? '';
  const [params] = useSearchParams();
  const get = (k: string) => params.get(k) ?? undefined;
  const view: ChangesView = { from_seq: get('from_seq'), to_seq: get('to_seq'), from_date: get('from_date'), from_scan: get('from_scan'), show: get('show'), kind: get('kind'), process: get('process') };
  const q = useChanges(portal, view);
  const c = q.data?.counts;
  const meta = c && q.data?.has_model ? `${plural(c.all, 'change')} · ${String(c.needs)} need you · ${String(c.explained)} explained automatically` : undefined;
  return (
    <Shell current="changes">
      <PageHead
        crumbs={[{ label: 'Portals', href: '/app/' }, { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` }, { label: 'Changes' }]}
        title="What changed"
        meta={meta}
        actions={q.data?.has_model ? <LinkButton href={reviewHref(portal)}>Open Review</LinkButton> : undefined}
      />
      <QueryState query={q} what="the changes">
        {(page) => <Body page={page} view={view} />}
      </QueryState>
    </Shell>
  );
}
