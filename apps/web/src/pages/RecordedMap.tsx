import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Check,
  Cluster,
  Columns,
  Field,
  Fieldset,
  Graph,
  GraphNode,
  Legend,
  Plate,
  type GraphEdge,
  Segmented,
  Select,
  shortScanId,
  Split,
  Stack,
  Table,
  Tag,
  Text,
} from '../design-system';
import { planHref } from '../app/api-plan';
import { recordedQuery, useRecordedMap, type RecordedFilter, type RecordedMap, type RecordedNode } from '../app/api-recorded';
import { QueryState } from '../app/QueryState';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';
import { RecordedInspector, stateHref } from './RecordedInspector';

type Show = 'graph' | 'list';

/** What the page address carries for the view One scan's path. */
interface View {
  f: RecordedFilter;
  show: Show;
  node: string;
}
type SetView = (next: Partial<View> & { view?: string }) => void;

const narrow = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches;

function Tools({ m, v, set }: { m: RecordedMap; v: View; set: SetView }) {
  const layers = m.filter.layers;
  const toggle = (layer: string, on: boolean) =>
    set({ f: { ...v.f, layers: on ? [...layers, layer] : layers.filter((l) => l !== layer) } });
  return (
    <Cluster>
      {m.views.length > 0 && (
        <Segmented
          label="View"
          selected="path"
          onSelect={(view) => set({ view })}
          items={m.views.map((o) => ({ value: o.value, label: o.label }))}
        />
      )}
      <Field label="Scans">
        <Select value={m.filter.scan ?? ''} onChange={(e) => set({ f: { ...v.f, scan: e.target.value } })}>
          <option value="">{`All ${String(m.scans.length)} scans (merged)`}</option>
          {m.scans.map((s) => (
            <option key={s.id} value={s.id}>
              {`${shortScanId(s.id, m.scans.map((o) => o.id))} · ${s.persona} · ${s.status.word}`}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Persona">
        <Select value={m.filter.persona ?? ''} onChange={(e) => set({ f: { ...v.f, persona: e.target.value } })}>
          <option value="">Every persona</option>
          {m.personas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>
      <Fieldset legend="Layers">
        {m.layer_options.map((o) => (
          <Check
            key={o.value}
            label={o.label}
            checked={layers.includes(o.value)}
            onChange={(e) => toggle(o.value, e.target.checked)}
          />
        ))}
      </Fieldset>
      <Segmented
        label="Show as"
        selected={v.show}
        onSelect={(show) => set({ show: show === 'list' ? 'list' : 'graph' })}
        items={[
          { value: 'graph', label: 'Graph' },
          { value: 'list', label: 'List' },
        ]}
      />
    </Cluster>
  );
}

/** The address of this view with route family `route` opened. */
function opened(v: View, route: string) {
  const p = recordedQuery({ ...v.f, open: route });
  p.set('view', 'path');
  if (v.show === 'list') p.set('show', 'list');
  return `?${p.toString()}`;
}

function Meta({ n }: { n: RecordedNode }) {
  return (
    <>
      <ShownStatus status={n.status} />
      {n.kind_status && <ShownStatus status={n.kind_status} />}
      {n.chips.map((c) => (
        <ShownChip key={c.word} chip={c} />
      ))}
      {n.returns && <ShownChip chip={n.returns} said={n.returns_said} />}
    </>
  );
}

/** The API's edges as the graph draws them (its labels placed, its arrowheads). */
const graphEdges = (m: RecordedMap): GraphEdge[] =>
  m.edges.map((e) => ({ d: e.d, state: e.state, label: e.label ?? undefined, labelX: e.label_x ?? undefined, labelY: e.label_y ?? undefined, arrow: e.arrow ?? undefined }));

function RecordedGraph({ m, v, set }: { m: RecordedMap; v: View; set: SetView }) {
  const which = m.filter.scan ? `scan ${shortScanId(m.filter.scan, m.scans.map((s) => s.id))}` : 'every scan';
  return (
    <Stack>
      <Graph label={`Map of ${m.portal} as ${which} recorded it, from the start page`} width={m.width} height={m.height} edges={graphEdges(m)} embedded>
        {m.nodes.map((n) =>
          n.kind === 'family' ? (
            <GraphNode
              key={n.id}
              id={n.id}
              x={n.x}
              y={n.y}
              height={m.node_h}
              near={n.near}
              route={`${n.route}/…`}
              title={n.title}
              state={n.state ?? undefined}
              href={opened(v, n.route)}
              meta={<Meta n={n} />}
            />
          ) : (
            <GraphNode
              key={n.id}
              id={n.id}
              x={n.x}
              y={n.y}
              height={m.node_h}
              near={n.near}
              route={n.route}
              title={<Text asIs>{n.title}</Text>}
              fullTitle={n.title}
              state={n.state ?? undefined}
              deck={n.deck}
              dim={n.dim}
              pressed={v.node === n.id}
              onSelect={() => set({ node: n.id })}
              marks={
                n.marked ? (
                  <Tag size="sm" intent>
                    Probe
                  </Tag>
                ) : undefined
              }
              meta={<Meta n={n} />}
            />
          ),
        )}
      </Graph>
      <Split>
        <Legend label="Moves" items={m.legend.map((o) => ({ state: o.value, label: o.label }))} />
        <Cluster>
          {m.node_legend.map((s) => (
            <ShownStatus key={s.word} status={s} />
          ))}
          <Text small muted>
            Deck = several states
          </Text>
        </Cluster>
      </Split>
      <Text small muted block>
        Click a screen to inspect · arrows move along the tree · solid lines are this scan&apos;s moves, dashed ones it did not make · ↩ on a screen counts the moves back to it
      </Text>
    </Stack>
  );
}

function RecordedList({ m, v }: { m: RecordedMap; v: View }) {
  const rows = [...m.nodes].sort((a, b) => a.depth - b.depth);
  const columns = [
    { header: 'Depth', numeric: true, cell: (n: RecordedNode) => n.depth },
    {
      header: 'Route',
      rowHeader: true,
      cell: (n: RecordedNode) => {
        if (n.kind === 'family') return <Text route href={opened(v, n.route)}>{`${n.route}/…`}</Text>;
        return (
          <Cluster>
            {n.first_state ? <Text route href={stateHref(n.first_state)}>{n.route}</Text> : <Text route>{n.route}</Text>}
            {n.marked && (
              <Tag size="sm" intent>
                Probe
              </Tag>
            )}
          </Cluster>
        );
      },
    },
    { header: 'Title', cell: (n: RecordedNode) => <Text asIs>{n.title}</Text> },
    { header: 'States', numeric: true, cell: (n: RecordedNode) => n.states },
    { header: 'Status', cell: (n: RecordedNode) => <ShownStatus status={n.status} /> },
    {
      header: 'Left',
      cell: (n: RecordedNode) => (
        <Cluster>
          {n.chips.map((c) => (
            <ShownChip key={c.word} chip={c} />
          ))}
        </Cluster>
      ),
    },
  ];
  return (
    <Plate title={`Screens by depth · ${String(m.screens)}`} flush>
      <Table caption={`Recorded screens of ${m.portal}`} columns={columns} rows={rows} rowKey={(n) => n.id} dense flush />
    </Plate>
  );
}

function Body({ m, v, set }: { m: RecordedMap; v: View; set: SetView }) {
  if (m.screens === 0)
    return (
      <Plate title="Nothing mapped yet">
        <Text block>Ask the assistant to scan the portal; every screen it records shows up here.</Text>
      </Plate>
    );
  return (
    <Stack>
      <Text small muted block>
        {recordedMeta(m)} · <Text href={planHref(m.portal)}>Next scan plan</Text>
      </Text>
      <Tools m={m} v={v} set={set} />
      <Columns
        main={v.show === 'graph' ? <RecordedGraph m={m} v={v} set={set} /> : <RecordedList m={m} v={v} />}
        side={<RecordedInspector portal={m.portal} screen={v.node} />}
      />
    </Stack>
  );
}

/** The recorded map's counts, above its tools. */
function recordedMeta(m: RecordedMap) {
  const plural = (n: number, w: string) => `${String(n)} ${w}${n === 1 ? '' : 's'}`;
  const marks = m.open_marks ? ` · ${plural(m.open_marks, 'mark')} for the next scan` : '';
  return `${plural(m.screens, 'screen')} · ${plural(m.transitions, 'transition')} · ${String(m.queued)} queued${marks}`;
}

/**
 * The recorded map (screen 12): every recorded screen of the portal, the discovery tree, what each
 * page left, with Scans, Persona and the layers in the address; the inspector sets the marks for
 * the next scan. The view One scan's path of a portal with a model, and the map of one without.
 */
export function RecordedMapBody({ portal }: { portal: string }) {
  const [params, setParams] = useSearchParams();
  const [defaultShow] = useState<Show>(() => (narrow() ? 'list' : 'graph'));
  const shown = params.get('show');
  const v: View = {
    f: {
      scan: params.get('scan') ?? '',
      persona: params.get('persona') ?? '',
      layers: params.has('layers') ? params.getAll('layers').filter(Boolean) : null,
      open: params.get('open') ?? '',
    },
    show: shown === 'list' || shown === 'graph' ? shown : defaultShow,
    node: params.get('node') ?? '',
  };
  const set: SetView = ({ view, ...next }) => {
    if (view !== undefined && view !== 'path') {
      setParams(view === 'now' ? {} : { view }, { replace: true });
      return;
    }
    const to = { ...v, ...next };
    const p = recordedQuery(to.f);
    p.set('view', 'path');
    if (to.show !== defaultShow) p.set('show', to.show);
    if (to.node) p.set('node', to.node);
    setParams(p, { replace: true });
  };
  const q = useRecordedMap(portal, v.f);
  return (
    <QueryState query={q} what="the recorded map">
      {(m) => <Body m={m} v={v} set={set} />}
    </QueryState>
  );
}
