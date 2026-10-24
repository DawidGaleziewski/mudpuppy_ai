import type { FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  Button,
  Callout,
  Cluster,
  Field,
  Input,
  Meter,
  PageHead,
  Plate,
  RowPicture,
  Segmented,
  Select,
  Skeleton,
  Stack,
  Status,
  Table,
  Tag,
  Text,
} from '../design-system';
import { screenFilter, useScreens, type ScreenFilter, type ScreenOut, type ScreensData } from '../app/api-screens';
import { headMeta, QueryState } from '../app/QueryState';
import { ScreenBrowser, useScreenBrowser } from '../app/ScreenBrowser';
import { ScreensViews } from '../app/ScreensViews';
import { Shell } from '../app/Shell';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';

const STATUSES = [
  ['active', 'Active'],
  ['merged', 'Merged'],
  ['retired', 'Retired'],
] as const;

/** A screen, with the list it is opened from (`list=`: this list's filter), so it has Prev / Next. */
const screenHref = (portal: string, key: string, list: string) =>
  `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}?list=${encodeURIComponent(list)}`;

function columns(portal: string, list: string, open: (key: string) => void) {
  return [
    {
      header: 'Screen',
      rowHeader: true,
      // designer T-03: the main variant's picture left of the name; it opens the dialog browsing this list
      cell: (s: ScreenOut) => (
        <RowPicture src={s.picture?.shot ?? s.picture?.wire} alt={s.title || s.key} missing="not recorded yet" onOpen={() => open(s.key)} pick={s.key}>
          <Cluster>
            <Tag size="sm" href={screenHref(portal, s.key, list)}>
              {s.key}
            </Tag>
          </Cluster>
          <Text asIs>{s.title || '(untitled page)'}</Text>
          <Text route>{s.route}</Text>
        </RowPicture>
      ),
    },
    {
      header: 'Status',
      cell: (s: ScreenOut) => (
        <Stack>
          <ShownStatus status={s.status} />
          {s.needs > 0 && <Status status="needs">{`Needs you · ${String(s.needs)}`}</Status>}
        </Stack>
      ),
    },
    {
      header: 'Variants · why',
      cell: (s: ScreenOut) => (
        <Stack>
          <Text mono>{s.variants}</Text>
          {s.why.length > 0 && (
            <Cluster>
              {s.why.map((w) => (
                <ShownChip key={w.word} chip={w} />
              ))}
            </Cluster>
          )}
        </Stack>
      ),
    },
    {
      header: 'Last seen (UTC)',
      cell: (s: ScreenOut) => (s.last_seen ? <Text mono small>{s.last_seen}</Text> : <Text muted>—</Text>),
    },
    {
      header: 'Checked',
      cell: (s: ScreenOut) =>
        s.actions > 0 ? (
          <Meter
            label="Actions"
            srLabel={`Actions checked on ${s.title || s.key}`}
            value={s.checked}
            max={s.actions}
            status={s.checked === s.actions ? 'ok' : 'running'}
            detail={`${String(s.checked)} / ${String(s.actions)}${s.release ? ` on ${s.release}` : ''}`}
          />
        ) : (
          <Text small muted>
            no actions
          </Text>
        ),
    },
    { header: 'Part', cell: (s: ScreenOut) => s.parts.join(', ') || '—' },
    { header: 'Process', cell: (s: ScreenOut) => (s.process ? <Text asIs>{s.process.name}</Text> : <Text muted>—</Text>) },
  ];
}

function Filters({ data, f, set }: { data: ScreensData; f: ScreenFilter; set: (next: Partial<ScreenFilter>) => void }) {
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q');
    set({ q: typeof q === 'string' ? q.trim() : '' });
  };
  return (
    <form onSubmit={submit} aria-label="Filter screens">
      <Cluster>
        <Segmented
          label="Status"
          selected={f.status}
          onSelect={(status) => set({ status })}
          items={[
            ...STATUSES.map(([value, label]) => ({ value, label, count: data.counts[value] ?? 0 })),
            { value: '', label: 'All', count: total },
          ]}
        />
        <Field label="Key, title or route contains">
          <Input type="search" name="q" defaultValue={f.q} key={f.q} />
        </Field>
        {data.parts.length > 0 && (
          <Field label="Part">
            <Select value={f.part} onChange={(e) => set({ part: e.target.value })}>
              <option value="">Every part</option>
              {data.parts.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Has a variant of why">
          <Select value={f.why} onChange={(e) => set({ why: e.target.value })}>
            <option value="">Any</option>
            {data.whys.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sort">
          <Select value={f.sort || 'needs'} onChange={(e) => set({ sort: e.target.value })}>
            {data.sorts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" size="md">
          Apply
        </Button>
        {(f.q || f.part || f.why || f.process) && (
          <Button size="md" variant="quiet" onClick={() => set({ q: '', part: '', why: '', process: '' })}>
            Clear filters
          </Button>
        )}
      </Cluster>
    </form>
  );
}

function List({ portal, data, f, set }: { portal: string; data: ScreensData; f: ScreenFilter; set: (next: Partial<ScreenFilter>) => void }) {
  const browser = useScreenBrowser();
  if (!data.has_model) {
    return <Callout>No model yet: the first scan builds it. Start one from the chat.</Callout>;
  }
  const label = STATUSES.find(([v]) => v === f.status)?.[1] ?? 'All';
  const list = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const items = data.screens.map((s) => ({ key: s.key, title: s.title || s.key, route: s.route, shot: s.picture?.shot ?? null, wire: s.picture?.wire ?? null, href: screenHref(portal, s.key, list) }));
  const open = (key: string) => browser.open(items.findIndex((i) => i.key === key));
  return (
    <Stack>
      <Filters data={data} f={f} set={set} />
      <ScreenBrowser portal={portal} items={items} label="in this list" index={browser.index} onIndex={browser.open} onClose={browser.close} />
      <Plate title={`${label} screens · ${String(data.screens.length)}`} flush>
        <Table
          caption={`${label} screens of ${portal}`}
          columns={columns(portal, list, open)}
          rows={data.screens}
          rowKey={(s) => s.key}
          dense
          flush
          empty="No screen matches. Clear the filter, or pick another status."
        />
      </Plate>
    </Stack>
  );
}

/** The list at its final size while it loads (designer v2-23): the filter row, then rows of the picture's height. */
function ListSkeleton() {
  return (
    <>
      <Skeleton.Block height={56} />
      <Skeleton.Rows rows={8} rowHeight={61} />
    </>
  );
}

/** The portal model's screens (designer screen v2-06): needs you first, each with why its variants differ. */
export function Screens() {
  const portal = useParams().portal ?? '';
  const [params, setParams] = useSearchParams();
  const f = screenFilter(params);
  const set = (next: Partial<ScreenFilter>) => {
    const merged = { ...f, ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, v]) => v)), { replace: true });
  };
  const q = useScreens(portal, f);
  return (
    <Shell current="screens">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          { label: 'Screens' },
        ]}
        title="Screens"
        meta={headMeta(q, (d) => `${String(d.counts.active ?? 0)} active · ${String(d.counts.merged ?? 0)} merged · ${String(d.counts.retired ?? 0)} retired`)}
      />
      <ScreensViews portal={portal} current="list" {...(q.data ? { total: q.data.screens.length } : {})} />
      <QueryState query={q} what="the screens" skeleton={<ListSkeleton />}>
        {(data) => <List portal={portal} data={data} f={f} set={set} />}
      </QueryState>
    </Shell>
  );
}
