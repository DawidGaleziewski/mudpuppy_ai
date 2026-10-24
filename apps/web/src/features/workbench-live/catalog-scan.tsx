// The live Workbench's scan components (spec 075, the R-96 spike) as A2UI catalog entries: the
// designer's names and properties (catalog.json), drawn with the design system's own parts (spec
// 076: no CSS of their own): the meter, the graph with its zoom bar, the route as a path, the
// narration. Each reads its live values from its `data` path, which the server set; a click is an
// A2UI action.

import { z } from 'zod';
import { CommonSchemas, type ComponentContext } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { Button, Callout, Facts, Graph, GraphNode, Meter, Narration, Path, Stack, Status, Text } from '../../design-system';
import { useLiveFrame } from './context';
import type { LivePage, LiveScan } from './protocol';

const Scan = { scan: z.string(), data: CommonSchemas.DynamicValue.optional() };

const act = (context: ComponentContext, name: string, payload: Record<string, unknown>): void =>
  void context.dispatchAction({ event: { name, context: payload } });

/** Steps of the limit, pages, queued, where the crawler is; the status as the dashboard maps it. */
function ScanMeterView({ meter }: { meter: LiveScan['meter'] }) {
  const detail = `${String(meter.pages)} pages · ${String(meter.queued)} queued${meter.at ? ` · at ${meter.at}` : ''}`;
  if (meter.limit === null)
    return (
      <Text small>
        {meter.shown.word} · step {meter.steps} · {detail}
      </Text>
    );
  return (
    <Meter
      label={`${meter.shown.word} · step ${String(meter.steps)} of ${String(meter.limit)}`}
      value={meter.steps}
      max={meter.limit}
      detail={detail}
      {...(meter.shown.shape ? { status: meter.shown.shape } : {})}
      srLabel="Steps used"
    />
  );
}

/** The scan's graph: screens at the scan page's places, its tree, the crawler's node, the stop. */
function ScanGraph({ scan, pick }: { scan: LiveScan; pick: (route: string, state: number) => void }) {
  const { state } = useLiveFrame();
  const graph = scan.graph;
  if (!graph || graph.nodes.length === 0) return null;
  const selected = state?.ui.selected?.route;
  return (
    <Graph label={`Graph of scan ${scan.short}: ${String(graph.nodes.length)} screens`} width={graph.width} height={graph.height} edges={graph.edges.map((e) => ({ d: e.d, state: e.kind === 'failed' ? 'failed' : null }))} embedded>
      {graph.nodes.map((n) => (
        <GraphNode
          key={n.id}
          id={n.id}
          x={n.x}
          y={n.y}
          height={graph.nodeH}
          route={n.route}
          title={n.title}
          state={n.status === 'failed' ? 'failed' : undefined}
          process={graph.path.includes(n.id)}
          pressed={selected === n.route}
          onSelect={() => pick(n.route, 1)}
          marks={
            <>
              {n.here && <Status status="running">Crawler here</Status>}
              {n.stopped && <Status status="stopped">Stopped here</Status>}
            </>
          }
        />
      ))}
    </Graph>
  );
}

/** The route pages in visit order. */
function Route({ pages, pick }: { pages: LivePage[]; pick: (route: string, state: number) => void }) {
  return (
    <Path
      label="Route pages, in visit order"
      steps={pages.map((p) => ({
        id: `${p.route}:${String(p.state)}`,
        label: `${String(p.order)}. ${p.route}${p.state > 1 ? ` (${String(p.state)})` : ''}${p.sideTrips ? ` · +${String(p.sideTrips)} side` : ''}`,
        here: p.status === 'here',
        failed: p.status === 'failed',
        onSelect: () => pick(p.route, p.state),
      }))}
    />
  );
}

export const LiveMap = createComponentImplementation(
  { name: 'LiveMap', schema: z.object({ ...Scan, follow: z.boolean().optional(), view: z.string().optional() }) },
  ({ props, context }) => {
    const scan = props.data as LiveScan | undefined;
    if (!scan) return <Text small muted>{`Live map · waiting for scan ${props.scan}`}</Text>;
    const pick = (route: string, state: number) => act(context, 'page.select', { scan: props.scan, route, state });
    return (
      <Stack>
        <ScanMeterView meter={scan.meter} />
        {props.view !== 'filmstrip' && <ScanGraph scan={scan} pick={pick} />}
        <Route pages={scan.pages} pick={pick} />
      </Stack>
    );
  },
);

export const ScanMeter = createComponentImplementation({ name: 'ScanMeter', schema: z.object(Scan) }, ({ props, context }) => {
  const meter = props.data as LiveScan['meter'] | undefined;
  if (!meter) return null;
  return (
    <Stack>
      <ScanMeterView meter={meter} />
      {meter.status === 'running' && (
        <Button size="sm" onClick={() => act(context, 'scan.stop', { scan: props.scan })}>
          Stop…
        </Button>
      )}
    </Stack>
  );
});

export const LiveNarration = createComponentImplementation(
  { name: 'Narration', schema: z.object({ ...Scan, every: z.string().optional() }) },
  ({ props }) => {
    const lines = (props.data as LiveScan['narration'] | undefined) ?? [];
    return (
      <Narration
        lines={lines.map((l) => {
          const ref = l.cites[0] ?? l.at;
          return { at: l.at, clock: `${l.at.slice(11, 19)}Z`, text: l.text, step: Number(ref.split('#')[1] ?? 0), kind: l.kind, ref };
        })}
      />
    );
  },
);

export const ErrorCard = createComponentImplementation({ name: 'ErrorCard', schema: z.object(Scan) }, ({ props, context }) => {
  const stop = props.data as LiveScan['stop'] | undefined;
  if (!stop) return null;
  return (
    <Callout tone="failure" title={`Scan stopped${stop.route ? ` at ${stop.route}` : ''}`}>
      <Stack>
        <Text block>{stop.reason ?? 'No reason recorded.'}</Text>
        <Text small muted>{`Kept: ${String(stop.kept.pages)} pages, ${String(stop.kept.queued)} queued`}</Text>
        <Button size="sm" onClick={() => act(context, 'scan.resume', { scan: props.scan })}>
          Resume…
        </Button>
      </Stack>
    </Callout>
  );
});

function pageOf(pages: LivePage[], ref: unknown, selected: { route: string; state?: number } | null | undefined): LivePage | undefined {
  const want = ref === '@selected' ? selected : (ref as { route: string; state?: number } | undefined);
  return want ? pages.find((p) => p.route === want.route && (want.state === undefined || p.state === want.state)) : undefined;
}

const PageSchema = z.object({ ...Scan, page: z.unknown(), size: z.string().optional() });

export const PageDetail = createComponentImplementation({ name: 'PageDetail', schema: PageSchema }, ({ props }) => {
  const { state } = useLiveFrame();
  const page = pageOf((props.data as LivePage[] | undefined) ?? [], props.page, state?.ui.selected);
  if (!page) return <Text small muted>Pick a page on the map to see it here.</Text>;
  return (
    <Stack>
      <Text strong>{`${page.route} — ${page.title}`}</Text>
      <Facts
        items={[
          ['Visited', `#${String(page.order)} at step ${String(page.step)}`],
          ['At', page.at],
          ['Side pages', String(page.sideTrips)],
        ]}
      />
      <Text small muted>Your next message carries this page as context.</Text>
    </Stack>
  );
});

export const PageMiniature = createComponentImplementation({ name: 'PageMiniature', schema: PageSchema }, ({ props }) => {
  const page = pageOf((props.data as LivePage[] | undefined) ?? [], props.page, null);
  return <Text small>{page ? `${page.route} — ${page.title}` : 'Page not visited'}</Text>;
});
