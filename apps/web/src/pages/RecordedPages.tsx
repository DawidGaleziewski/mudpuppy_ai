import type { FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button, Cluster, Field, Input, LinkButton, PageHead, Picture, Plate, Stack, Table, Tag, Text } from '../design-system';
import { useRecordedPages, type RecordedPage, type RecordedPages as Pages } from '../app/api-recorded';
import { QueryState } from '../app/QueryState';
import { ScreensViews } from '../app/ScreensViews';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';
import { stateHref } from './RecordedInspector';

const columns = [
  {
    header: 'Picture',
    cell: (r: RecordedPage) => (
      <Picture shot={r.picture} title={r.title || '(untitled page)'} route={r.route} scans={r.scans} href={stateHref(r.state)} />
    ),
  },
  {
    header: 'Title',
    rowHeader: true,
    cell: (r: RecordedPage) => (
      <Stack>
        <Text asIs href={stateHref(r.state)}>
          {r.title || '(untitled page)'}
        </Text>
        <Text route>{r.route}</Text>
      </Stack>
    ),
  },
  { header: 'Confidence', cell: (r: RecordedPage) => <ShownStatus status={r.confidence} /> },
  {
    header: 'Form probes',
    cell: (r: RecordedPage) => {
      if (r.probe_marked)
        return (
          <Tag size="sm" intent>
            Probe
          </Tag>
        );
      return r.probe ? <ShownStatus status={r.probe} /> : <Text muted>—</Text>;
    },
  },
  { header: 'Scans', numeric: true, cell: (r: RecordedPage) => r.scans },
  { header: 'Personas', cell: (r: RecordedPage) => <Text small>{r.personas.join(', ') || '—'}</Text> },
  {
    header: 'Last seen (UTC)',
    cell: (r: RecordedPage) => (r.last_seen ? <Text mono small>{r.last_seen}</Text> : <Text muted>—</Text>),
  },
];

function Pager({ d, href }: { d: Pages; href: (page: number) => string }) {
  if (d.pages < 2) return null;
  return (
    <nav aria-label="Recorded pages, pages">
      <Cluster>
        {d.page > 1 && (
          <LinkButton size="sm" variant="quiet" href={href(d.page - 1)}>
            Previous
          </LinkButton>
        )}
        <Text small muted>{`Page ${String(d.page)} of ${String(d.pages)}`}</Text>
        {d.page < d.pages && (
          <LinkButton size="sm" variant="quiet" href={href(d.page + 1)}>
            Next
          </LinkButton>
        )}
      </Cluster>
    </nav>
  );
}

function List({ d, set, href }: { d: Pages; set: (q: string) => void; href: (page: number) => string }) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q');
    set(typeof q === 'string' ? q.trim() : '');
  };
  if (d.every === 0)
    return (
      <Plate title="No pages recorded yet">
        <Text block>Ask the assistant to scan the portal; every page it records shows up here.</Text>
      </Plate>
    );
  return (
    <Stack>
      <form onSubmit={submit} role="search" aria-label="Filter recorded pages">
        <Cluster>
          <Field label="Title or route contains">
            <Input type="search" name="q" defaultValue={d.q} key={d.q} />
          </Field>
          <Button type="submit" size="md">
            Filter
          </Button>
          {d.q && (
            <Button size="md" variant="quiet" onClick={() => set('')}>
              Clear
            </Button>
          )}
        </Cluster>
      </form>
      <Plate title={`Recorded pages · ${String(d.total)}`} flush>
        <Table
          caption={`Recorded pages of ${d.portal}`}
          columns={columns}
          rows={d.rows}
          rowKey={(r) => r.state}
          dense
          flush
          empty={`No page matches “${d.q}”. The filter looks at every page's title and route.`}
        />
      </Plate>
      <Pager d={d} href={href} />
    </Stack>
  );
}

function meta(d: Pages) {
  const s = `${String(d.every)} recorded page${d.every === 1 ? '' : 's'}`;
  if (!d.steps) return s;
  return `${s} · ${String(d.steps)} form step${d.steps === 1 ? '' : 's'}: ${String(d.steps_marked)} marked for probing, ${String(d.steps_unprobed)} not probed`;
}

/** Every page the scans recorded (the htmx Screens of a portal without a model), 25 a page. */
export function RecordedPages() {
  const portal = useParams().portal ?? '';
  const [params, setParams] = useSearchParams();
  const qText = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const set = (q: string) => setParams(q ? { q } : {}, { replace: true });
  const href = (n: number) => {
    const p = new URLSearchParams(qText ? { q: qText } : {});
    if (n > 1) p.set('page', String(n));
    const qs = p.toString();
    return qs ? `?${qs}` : '?';
  };
  const q = useRecordedPages(portal, qText, page);
  return (
    <Shell current="screens">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          { label: 'Screens', href: `/app/portals/${encodeURIComponent(portal)}/screens` },
          { label: 'Recorded pages' },
        ]}
        title="Recorded pages"
        meta={q.data ? meta(q.data) : undefined}
      />
      <ScreensViews portal={portal} current="recorded" />
      <QueryState query={q} what="the recorded pages">
        {(d) => <List d={d} set={set} href={href} />}
      </QueryState>
    </Shell>
  );
}
