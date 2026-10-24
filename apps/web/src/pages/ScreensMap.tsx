import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  Bundle,
  Callout,
  Cluster,
  Columns,
  Field,
  Graph,
  GraphNode,
  Legend,
  PageHead,
  Plate,
  Segmented,
  Select,
  Split,
  Stack,
  Table,
  Tag,
  Text,
} from '../design-system';
import { mapQuery, useMap, type MapData, type MapFilter, type MapNode } from '../app/api-map';
import { MapControls } from '../app/MapControls';
import { GraphSkeleton, QueryState } from '../app/QueryState';
import { ScreensViews } from '../app/ScreensViews';
import { Shell } from '../app/Shell';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';
import { MapInspector } from './MapInspector';
import { RecordedMapBody } from './RecordedMap';

type Show = 'graph' | 'list';

/** What the page address carries: the map's view, Graph or List, the selected screen. */
interface View {
  f: MapFilter;
  show: Show;
  node: string;
}

const screensHref = (portal: string) => `/app/portals/${encodeURIComponent(portal)}/screens`;

/** Below tablet width the list is the view (the graph scrolls in its box above it). */
const narrow = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches;

function Tools({ m, v, set }: { m: MapData; v: View; set: (next: Partial<View>) => void }) {
  return (
    <Cluster>
      <Segmented
        label="View"
        selected={m.filter.view}
        onSelect={(view) => set({ f: { ...v.f, view } })}
        items={m.views.map((o) => ({ value: o.value, label: o.label }))}
      />
      <Field label="Overlay a process">
        <Select value={m.filter.process ?? ''} onChange={(e) => set({ f: { ...v.f, process: e.target.value } })}>
          <option value="">None</option>
          {m.processes.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <MapControls m={m} v={v} set={set} />
    </Cluster>
  );
}

/** The address of this view with route family `route` opened. */
function opened(v: View, route: string) {
  const p = mapQuery({ ...v.f, open: route });
  if (v.show === 'list') p.set('show', 'list');
  return `?${p.toString()}`;
}

function nodeTitle(n: MapNode) {
  return `${n.role ? `${n.role} · ` : ''}${n.title}`;
}

function MapGraph({ m, v, set }: { m: MapData; v: View; set: (next: Partial<View>) => void }) {
  const since = m.filter.view === 'since' ? ' since the previous release' : ' now';
  const overlay = m.overlay ? `, with the process ${m.overlay.name} highlighted` : '';
  return (
    <Stack>
      <Graph
        label={`Map of ${m.portal}${since}${overlay}`}
        width={m.width}
        height={m.height}
        edges={m.edges.map((e) => ({ d: e.d, state: e.state, label: e.label, labelX: e.label_x, labelY: e.label_y }))}
      >
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
              dim={n.dim}
              href={opened(v, n.route)}
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
              title={<Text asIs>{nodeTitle(n)}</Text>}
              fullTitle={n.title}
              process={n.role !== null}
              dim={n.dim}
              state={n.retired ? 'retired' : undefined}
              pressed={v.node === n.key}
              onSelect={() => set({ node: n.key })}
              meta={
                <>
                  {n.retired && <ShownStatus status={n.status} />}
                  {n.chips.map((c) => (
                    <ShownChip key={c.word} chip={c} />
                  ))}
                  <ShownChip chip={n.inside} />
                </>
              }
            />
          ),
        )}
      </Graph>
      <Legend label="Link states" items={m.legend.map((o) => ({ state: o.value, label: o.label }))} />
      <Text small muted block>
        Not seen since: the link was missing on later visits. Not checked: not followed yet on the part&apos;s current
        release. Retired links are kept; the Retired links layer shows them. Bold boxes are the overlaid process&apos;s
        screens, faint boxes are outside it{m.filter.view === 'since' ? ' or unchanged since the previous release' : ''}.
        Actions inside a screen are counted on its box, never drawn as links.
      </Text>
      <Text small muted block>
        Click a screen to inspect · arrows move along links
      </Text>
    </Stack>
  );
}

function MapList({ m, v }: { m: MapData; v: View }) {
  const portal = m.portal;
  const rows = [...m.nodes].sort((a, b) => a.depth - b.depth);
  const columns = [
    {
      header: 'Screen',
      rowHeader: true,
      cell: (n: MapNode) =>
        n.kind === 'family' ? (
          <Cluster>
            <Text route href={opened(v, n.route)}>{`${n.route}/…`}</Text>
            <Text muted>{n.title}</Text>
          </Cluster>
        ) : (
          <Cluster>
            <Tag size="sm" href={`${screensHref(portal)}/${encodeURIComponent(n.key)}`}>
              {n.key}
            </Tag>
            <Text asIs>{n.title}</Text>
            <Text route>{n.route}</Text>
            {n.chips.map((c) => (
              <ShownChip key={c.word} chip={c} />
            ))}
          </Cluster>
        ),
    },
    {
      header: 'Links out (state)',
      cell: (n: MapNode) => {
        const links = m.out_links[n.id] ?? [];
        if (links.length === 0) return <Text muted>—</Text>;
        return (
          <Stack>
            {links.map((l, i) => (
              <Cluster key={i}>
                <Text asIs>{l.to_title}</Text>
                {l.rule && (
                  <Text mono small>
                    if {l.rule}
                  </Text>
                )}
                {l.status && <ShownStatus status={l.status} />}
              </Cluster>
            ))}
          </Stack>
        );
      },
    },
    { header: 'Actions inside', numeric: true, cell: (n: MapNode) => (n.kind === 'screen' ? n.actions : '') },
    { header: 'Overlay', cell: (n: MapNode) => n.role ?? '' },
  ];
  return (
    <Plate title={`Screens and links · ${String(m.nodes.length)}`} flush>
      <Table caption={`Screens and links of ${portal}`} columns={columns} rows={rows} rowKey={(n) => n.id} dense flush />
    </Plate>
  );
}

function MapBody({ m, v, set }: { m: MapData; v: View; set: (next: Partial<View>) => void }) {
  if (!m.has_model) {
    return (
      <Stack>
        <Callout>No model yet: the first scan builds it. Until then the map shows what the scans recorded.</Callout>
        <RecordedMapBody portal={m.portal} />
      </Stack>
    );
  }
  return (
    <Stack>
      <Tools m={m} v={v} set={set} />
      <Columns
        main={
          <Stack>
            {(m.bundled > 0 || m.overlay) && (
              <Split>
                {m.bundled > 0 && (
                  <Bundle label="Bundled links">
                    <Text>
                      Menu on every page · <Text strong>{`${String(m.bundled)} link${m.bundled === 1 ? '' : 's'}`}</Text> ·
                      bundled
                    </Text>
                    {m.bundled_drawn.length > 0 && (
                      <Text asIs>{`${String(m.bundled_drawn.length)} drawn because it changed: ${m.bundled_drawn.join(', ')}`}</Text>
                    )}
                  </Bundle>
                )}
                {m.overlay && (
                  <Text small muted>
                    Overlay: <Text asIs>{m.overlay.name}</Text>
                  </Text>
                )}
              </Split>
            )}
            {v.show === 'graph' ? <MapGraph m={m} v={v} set={set} /> : <MapList m={m} v={v} />}
          </Stack>
        }
        side={<MapInspector portal={m.portal} screenKey={v.node} />}
      />
    </Stack>
  );
}

function meta(m: MapData) {
  const s = `${String(m.screens)} active screen${m.screens === 1 ? '' : 's'} · ${String(m.links)} link${m.links === 1 ? '' : 's'}`;
  if (m.filter.view === 'since')
    return `${s} · since model version ${String(m.since)} · ${String(m.changed)} change${m.changed === 1 ? '' : 's'}`;
  return `${s} · now`;
}

function crumbs(portal: string) {
  return [
    { label: 'Portals', href: '/app/' },
    { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
    { label: 'Screens', href: screensHref(portal) },
    { label: 'Map' },
  ];
}

/** Screens ▸ Map: the model's map (Now, Since previous release), or One scan's path, the recorded map. */
export function ScreensMap() {
  const [params] = useSearchParams();
  return params.get('view') === 'path' ? <RecordedMapPage /> : <ModelMap />;
}

function RecordedMapPage() {
  const portal = useParams().portal ?? '';
  return (
    <Shell current="screens">
      <PageHead crumbs={crumbs(portal)} title="Map" />
      <ScreensViews portal={portal} current="map" />
      <RecordedMapBody portal={portal} />
    </Shell>
  );
}

/** The portal model's map (designer screen v2-08): screens and their links in their state, a process overlaid, one screen inspected. */
function ModelMap() {
  const portal = useParams().portal ?? '';
  const [params, setParams] = useSearchParams();
  const [defaultShow] = useState<Show>(() => (narrow() ? 'list' : 'graph'));
  const shown = params.get('show');
  const v: View = {
    f: {
      view: params.get('view') ?? 'now',
      layers: params.has('layers') ? params.getAll('layers').filter(Boolean) : null,
      process: params.get('process') ?? '',
      open: params.get('open') ?? '',
    },
    show: shown === 'list' || shown === 'graph' ? shown : defaultShow,
    node: params.get('node') ?? '',
  };
  const set = (next: Partial<View>) => {
    if (next.f?.view === 'path') {
      setParams({ view: 'path' }, { replace: true });
      return;
    }
    const to = { ...v, ...next };
    const p = mapQuery(to.f);
    if (to.show !== defaultShow) p.set('show', to.show);
    if (to.node) p.set('node', to.node);
    setParams(p, { replace: true });
  };
  const q = useMap(portal, v.f);
  return (
    <Shell current="screens">
      <PageHead
        crumbs={crumbs(portal)}
        title="Map"
        meta={q.data?.has_model ? meta(q.data) : undefined}
      />
      <ScreensViews portal={portal} current="map" />
      <QueryState query={q} what="the map" skeleton={<GraphSkeleton />}>
        {(m) => <MapBody m={m} v={v} set={set} />}
      </QueryState>
    </Shell>
  );
}
