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
import { sameScreenHref } from '../app/api-same-screen';
import { ScreenNeighbours } from '../app/ScreenNeighbours';
import { useScreen, type ActionOut, type ScreenDetailData, type VariantOut } from '../app/api-screens';
import { useScreenRecordings, type ScreenRecordings } from '../app/api-state';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { RecordingView } from '../app/Recording';
import { Shell } from '../app/Shell';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';
import { ScreenAmendments } from './ScreenAmendments';
import { Inputs, ReachedAt } from './ScreenRecordings';

// Designer Q10: Variants · Inputs (screens with a form) · Actions · Amendments · History.
type Tab = 'variants' | 'inputs' | 'actions' | 'amendments' | 'history';

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

/** The Screen page with one of its recordings open in the dialog. */
const recordingOn = (d: ScreenDetailData, v: VariantOut) =>
  `${screenHref(d.portal, d.screen.key)}?variant=r${String(v.ordinal)}&recording=${encodeURIComponent(v.state_id)}`;

function VariantList({ d }: { d: ScreenDetailData }) {
  // the dialog steps through the variants that have a picture (← / →)
  const pictured = d.variants.filter((v) => v.picture?.shot ?? v.picture?.wire);
  const items = pictured.map((v) => ({ label: variantLabel(v), shot: v.picture?.shot, wire: v.picture?.wire }));
  // Compare a variant with the first one side by side, what differs listed, persona too (designer Q10)
  const base = d.variants[0];
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
                href={recordingOn(d, v)}
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
            {base && v.state_id !== base.state_id && (
              <Text small href={sameScreenHref(d.portal, { screen: d.screen.key, a: base.state_id, b: v.state_id })}>
                {`Compare with r${String(base.ordinal)}`}
              </Text>
            )}
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

interface DetailProps {
  d: ScreenDetailData;
  rec: ScreenRecordings | undefined;
  tab: Tab;
  setTab: (t: Tab) => void;
  ask: (a: Ask) => void;
}

function Detail({ d, rec, tab, setTab, ask }: DetailProps) {
  const none = () => <Text small muted>This screen has no recordings.</Text>;
  const panels: Record<Tab, () => ReactNode> = {
    variants: () => <VariantList d={d} />,
    inputs: () => (rec ? <Inputs rec={rec} ask={ask} /> : none()),
    actions: () => <Actions d={d} />,
    amendments: () => (rec ? <ScreenAmendments portal={d.portal} state={rec.state} list={rec.amendments} canMark={rec.can_mark} ask={ask} /> : none()),
    history: () => <History d={d} />,
  };
  const items = [
    { id: 'variants', label: 'Variants', count: d.variants.length },
    ...(rec?.inputs.length ? [{ id: 'inputs', label: 'Inputs', count: rec.inputs.length }] : []),
    { id: 'actions', label: 'Actions', count: d.actions.length },
    { id: 'amendments', label: 'Amendments', count: rec?.amendments.items.length ?? 0 },
    { id: 'history', label: 'History', count: d.history.length + d.labels.length },
  ];
  return (
    <Stack>
      <Needs d={d} />
      <Tabs label="Screen sections" panelPrefix="screen" selected={tab} onSelect={(t) => setTab(t as Tab)} items={items} />
      <TabPanel prefix="screen" id={tab}>
        {panels[tab]()}
      </TabPanel>
    </Stack>
  );
}

function meta(d: ScreenDetailData, rec: ScreenRecordings | undefined) {
  const s = d.screen;
  return (
    <Stack>
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
      {rec && <ReachedAt rec={rec} />}
    </Stack>
  );
}

const TABS: readonly Tab[] = ['variants', 'inputs', 'actions', 'amendments', 'history'];

/** A recording of this screen open over the page (`?recording=`, designer Q10); ← / → step through the variants. */
function OpenRecording({ d, state, hl, setParams }: { d: ScreenDetailData; state: string; hl: string | null; setParams: ReturnType<typeof useSearchParams>[1] }) {
  const set = {
    states: d.variants.map((v) => ({ state: v.state_id, label: `r${String(v.ordinal)}` })),
    go: (s: string) =>
      setParams((p) => {
        p.set('recording', s);
        return p;
      }),
  };
  const close = () =>
    setParams((p) => {
      p.delete('recording');
      p.delete('hl');
      return p;
    });
  return <RecordingView key={state} state={state} hl={hl} onClose={close} set={set} />;
}

/** One screen of the portal model (designer screen v2-07): what needs you on it, its variants, inputs, actions, amendments and history. */
export function Screen() {
  const { portal = '', screenKey = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t === params.get('tab')) ?? 'variants';
  const q = useScreen(portal, screenKey);
  const rec = useScreenRecordings(portal, screenKey).data;
  const { ask, view } = useConfirmedWrite(['portals', portal, 'screens', screenKey]);
  const recording = params.get('recording');
  const title = q.data ? q.data.screen.title || '(untitled page)' : screenKey;
  return (
    <Shell current="screens">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          // back to the list it was opened from (`list=`), else the list as it was left
          { label: 'Screens', href: `/app/portals/${encodeURIComponent(portal)}/screens${params.get('list') ? `?${params.get('list') ?? ''}` : ''}` },
          { label: <Text asIs>{screenKey}</Text> },
        ]}
        title={
          <>
            <Tag>{screenKey}</Tag> <Text asIs>{title}</Text>
          </>
        }
        meta={q.data ? meta(q.data, rec) : undefined}
        actions={<ScreenNeighbours portal={portal} screenKey={screenKey} list={params.get('list')} />}
      />
      {view}
      <QueryState query={q} what="the screen">
        {(d) => (
          <>
            <Detail d={d} rec={rec} tab={tab} ask={ask} setTab={(t) => setParams({ tab: t }, { replace: true })} />
            {recording && <OpenRecording d={d} state={recording} hl={params.get('hl')} setParams={setParams} />}
          </>
        )}
      </QueryState>
    </Shell>
  );
}
