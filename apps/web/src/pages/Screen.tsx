import type { ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  Chip,
  Cluster,
  Count,
  Note,
  PageHead,
  Picture,
  Plate,
  Row,
  Rows,
  Stack,
  Table,
  TabPanel,
  Tabs,
  Tag,
  Text,
  Timeline,
  TimelineItem,
  Variant,
  Variants,
} from '../design-system';
import { useScreen, type ActionOut, type ScreenDetailData, type VariantOut } from '../app/api-screens';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';

type Tab = 'variants' | 'actions' | 'history';

const screenHref = (portal: string, key: string) =>
  `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}`;

function Needs({ d }: { d: ScreenDetailData }) {
  if (d.needs.length === 0) return null;
  return (
    <Plate title="Needs you on this screen" variant="intent" flush actions={<Count>{d.needs.length}</Count>}>
      <Rows label="What needs you on this screen">
        {d.needs.map((it) => (
          <Row key={`${it.kind}-${it.id}`} tone="intent" aside={<Text mono small muted>{it.at}</Text>}>
            <Cluster>
              <ShownChip chip={it.chip} />
              {it.keys.map((k) => (
                <Tag key={k} size="sm">
                  {k}
                </Tag>
              ))}
            </Cluster>
            <Text asIs>{it.claim}</Text>
          </Row>
        ))}
      </Rows>
    </Plate>
  );
}

function seen(v: VariantOut) {
  const when = v.first_seen
    ? ` · ${v.first_seen}${v.last_seen && v.last_seen !== v.first_seen ? ` – ${v.last_seen}` : ''}`
    : '';
  const releases = v.releases.length ? `${v.releases.join(', ')} · ` : '';
  return `${releases}${v.personas.join(', ') || '—'} · ${String(v.visits)} visit${v.visits === 1 ? '' : 's'}${when}`;
}

const variantLabel = (v: VariantOut) => `r${String(v.ordinal)}`;

function VariantList({ d }: { d: ScreenDetailData }) {
  // the dialog steps through the variants that have a picture (← / →)
  const pictured = d.variants.filter((v) => v.picture?.shot ?? v.picture?.wire);
  const items = pictured.map((v) => ({ label: variantLabel(v), shot: v.picture?.shot, wire: v.picture?.wire }));
  return (
    <Plate label="Variants">
      <Variants>
        {d.variants.map((v) => (
          <Variant
            key={v.state_id}
            id={`variant-${v.state_id}`}
            label={<Text asIs>{variantLabel(v)}</Text>}
            aside={<ShownChip chip={{ word: v.reason, variant: v.reason_chip }} />}
            picture={
              <Picture
                shot={v.picture?.shot}
                wire={v.picture?.wire}
                title={v.title || d.screen.title}
                alt={`Variant ${variantLabel(v)} of ${v.title || d.screen.title}`}
                route={d.screen.route}
                set={{ items, at: Math.max(0, pictured.indexOf(v)) }}
                {...(v.picture ? { scans: v.picture.scans } : {})}
              />
            }
          >
            <Text small muted block>
              {seen(v)}
            </Text>
            <ShownStatus status={v.status} />
            <Text small block>
              {v.explanation}
            </Text>
            {d.variants.length === 1 && (
              <Text small block>
                One variant so far. A second one appears here when a scan sees this screen differently (another release,
                persona or state).
              </Text>
            )}
          </Variant>
        ))}
      </Variants>
    </Plate>
  );
}

function leadsTo(portal: string, own: string, a: ActionOut) {
  if (a.leads_to.length === 0) return <Text muted>not tried yet</Text>;
  return (
    <Stack>
      {a.leads_to.map((l, i) => (
        <Cluster key={i}>
          {l.key === own && <Text muted>inside this screen</Text>}
          {l.key && l.key !== own && (
            <>
              <Tag size="sm" href={screenHref(portal, l.key)}>
                {l.key}
              </Tag>
              <Text asIs>{l.title}</Text>
            </>
          )}
          {!l.key && <Text muted>no page</Text>}
          {l.note && <Chip>{l.note}</Chip>}
        </Cluster>
      ))}
    </Stack>
  );
}

function Actions({ d }: { d: ScreenDetailData }) {
  const columns = [
    {
      header: 'Action',
      rowHeader: true,
      cell: (a: ActionOut) => (
        <Cluster>
          <Text mono small asIs>
            {a.element_key}
          </Text>
          {a.is_global && <Chip>on every page</Chip>}
        </Cluster>
      ),
    },
    { header: 'Kind', cell: (a: ActionOut) => a.kind },
    { header: 'Status', cell: (a: ActionOut) => <ShownStatus status={a.status} /> },
    { header: 'Leads to', cell: (a: ActionOut) => leadsTo(d.portal, d.screen.key, a) },
  ];
  return (
    <Plate flush label="Actions">
      <Table
        caption={`Actions on ${d.screen.key}`}
        columns={columns}
        rows={d.actions}
        rowKey={(a) => a.element_key}
        dense
        flush
        empty="No action recorded on this screen."
      />
    </Plate>
  );
}

function History({ d }: { d: ScreenDetailData }) {
  return (
    <Stack>
      <Plate title="Changes">
        {d.history.length === 0 ? (
          <Text small muted block>
            No change since the screen was first seen.
          </Text>
        ) : (
          <Timeline label="Changes on this screen">
            {d.history.map((ch) => (
              <TimelineItem
                key={ch.id}
                status={ch.status.shape === 'needs' ? 'draft' : 'ok'}
                head={
                  <>
                    <ShownChip chip={ch.chip} /> <ShownStatus status={ch.status} />{' '}
                    <Text mono small muted>
                      model version {ch.model_seq} · {ch.created_at}
                    </Text>
                  </>
                }
              >
                <Text asIs>{ch.finding}</Text>
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </Plate>
      {d.labels.length > 0 && (
        <Plate title="Same screen? answers">
          <Timeline label="Same screen? answers">
            {d.labels.map((e, i) => (
              <TimelineItem
                key={i}
                status="ok"
                head={
                  <>
                    <Text strong>{e.by}</Text>: {e.answer}{' '}
                    <Text mono small muted>
                      {e.at}
                    </Text>
                  </>
                }
              >
                <Stack>
                  <Text asIs>{`${e.a} and ${e.b}`}</Text>
                  {e.reason && (
                    <Note by={`${e.by} · ${e.at}`} size="sm">
                      {e.reason}
                    </Note>
                  )}
                </Stack>
              </TimelineItem>
            ))}
          </Timeline>
        </Plate>
      )}
    </Stack>
  );
}

function Detail({ d, tab, setTab }: { d: ScreenDetailData; tab: Tab; setTab: (t: Tab) => void }) {
  const panels: Record<Tab, () => ReactNode> = {
    variants: () => <VariantList d={d} />,
    actions: () => <Actions d={d} />,
    history: () => <History d={d} />,
  };
  return (
    <Stack>
      <Needs d={d} />
      <Tabs
        label="Screen sections"
        panelPrefix="screen"
        selected={tab}
        onSelect={(t) => setTab(t as Tab)}
        items={[
          { id: 'variants', label: 'Variants', count: d.variants.length },
          { id: 'actions', label: 'Actions', count: d.actions.length },
          { id: 'history', label: 'History', count: d.history.length + d.labels.length },
        ]}
      />
      <TabPanel prefix="screen" id={tab}>
        {panels[tab]()}
      </TabPanel>
    </Stack>
  );
}

function meta(d: ScreenDetailData) {
  const s = d.screen;
  return (
    <Cluster>
      <Text route>{s.route}</Text>
      {s.parts.length > 0 && <Text>part {s.parts.join(', ')}</Text>}
      <ShownStatus status={s.status} />
      {s.last_seen && <Text>last seen {s.last_seen}</Text>}
      <Text>
        Checked {s.checked} / {s.actions} actions
      </Text>
      {s.process && (
        <Text>
          in process <Text asIs>{s.process.name}</Text>
        </Text>
      )}
    </Cluster>
  );
}

const TABS: readonly Tab[] = ['variants', 'actions', 'history'];

/** One screen of the portal model (designer screen v2-07): what needs you on it, its variants, actions and history. */
export function Screen() {
  const { portal = '', screenKey = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t === params.get('tab')) ?? 'variants';
  const q = useScreen(portal, screenKey);
  const title = q.data ? q.data.screen.title || '(untitled page)' : screenKey;
  return (
    <Shell current="screens">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          { label: 'Screens', href: `/app/portals/${encodeURIComponent(portal)}/screens` },
          { label: <Text asIs>{screenKey}</Text> },
        ]}
        title={
          <>
            <Tag>{screenKey}</Tag> <Text asIs>{title}</Text>
          </>
        }
        meta={q.data ? meta(q.data) : undefined}
      />
      <QueryState query={q} what="the screen">
        {(d) => <Detail d={d} tab={tab} setTab={(t) => setParams({ tab: t }, { replace: true })} />}
      </QueryState>
    </Shell>
  );
}
