// The live Workbench's scan components (spec 075, the R-96 spike) as A2UI catalog entries: the
// designer's names and properties (catalog.json), drawn as plain grey boxes until the designer's
// look (owner 2026-10-24: "ugly unstyled components … as placeholders"). Each reads its live
// values from its `data` path, which the server set; a click is an A2UI action.

import { z } from 'zod';
import { CommonSchemas, type ComponentContext } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { useLiveFrame } from './context';
import type { LiveGraph, LiveNode, LivePage, LiveScan } from './protocol';

const Scan = { scan: z.string(), data: CommonSchemas.DynamicValue.optional() };

const act = (context: ComponentContext, name: string, payload: Record<string, unknown>): void =>
  void context.dispatchAction({ event: { name, context: payload } });

/** Steps of the limit, pages, queued, where the crawler is. */
export function Meter({ meter }: { meter: LiveScan['meter'] }) {
  const of = meter.limit ? ` of ${String(meter.limit)}` : '';
  const pct = meter.limit ? Math.min(100, Math.round((meter.steps / meter.limit) * 100)) : null;
  return (
    <div className="wbx-meter" data-status={meter.status}>
      <strong>{meter.status}</strong> · step {meter.steps}
      {of} · {meter.pages} pages · {meter.queued} queued{meter.at ? ` · at ${meter.at}` : ''}
      {pct !== null && (
        <div className="wbx-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Steps used">
          <div className="wbx-bar__fill" style={{ width: `${String(pct)}%` }} />
        </div>
      )}
    </div>
  );
}

function Node({ n, graph, onPick, picked }: { n: LiveNode; graph: LiveGraph; onPick: (n: LiveNode) => void; picked: boolean }) {
  const onPath = graph.path.includes(n.id);
  return (
    <g className="wbx-node" data-here={n.here} data-path={onPath} data-status={n.status} data-picked={picked} onClick={() => onPick(n)}>
      <rect x={n.x} y={n.y} width={graph.nodeW} height={graph.nodeH} />
      <text x={n.x + 6} y={n.y + 16}>
        #{n.order} {n.route}
      </text>
      <text x={n.x + 6} y={n.y + 32}>
        {n.title.slice(0, 22)}
      </text>
      {n.here && (
        <text x={n.x + 6} y={n.y + graph.nodeH - 8} className="wbx-node__here">
          ◉ crawler here
        </text>
      )}
      {n.stopped && (
        <text x={n.x + 6} y={n.y + graph.nodeH - 24} className="wbx-node__stop">
          ✕ stopped here
        </text>
      )}
    </g>
  );
}

/** The scan's graph: screens at the scan page's places, its tree and failed moves, the crawler. */
export function GraphBox({ graph, scan, onPick }: { graph: LiveGraph; scan: string; onPick: (n: LiveNode) => void }) {
  const { state } = useLiveFrame();
  const sel = state?.ui.selected;
  const pad = 8;
  return (
    <div className="wbx-graph" tabIndex={0} aria-label={`Graph of scan ${scan}, scrollable`}>
      <svg viewBox={`${String(-pad)} ${String(-pad)} ${String(graph.width + 2 * pad)} ${String(graph.height + 2 * pad)}`} role="img" aria-label={`Graph of scan ${scan}: ${String(graph.nodes.length)} screens`}>
        {graph.edges.map((e, i) => (
          <path key={i} d={e.d} className="wbx-edge" data-kind={e.kind} />
        ))}
        {graph.nodes.map((n) => (
          <Node key={n.id} n={n} graph={graph} onPick={onPick} picked={sel?.route === n.route} />
        ))}
      </svg>
    </div>
  );
}

/** The route pages in visit order (the filmstrip). */
export function Route({ pages, onPick }: { pages: LivePage[]; onPick: (p: LivePage) => void }) {
  return (
    <ol className="wbx-route" aria-label="Route pages">
      {pages.map((p) => (
        <li key={`${p.route}:${String(p.state)}`} data-status={p.status}>
          <button type="button" onClick={() => onPick(p)}>
            {p.order}. {p.route}
            {p.state > 1 ? ` (${String(p.state)})` : ''} · step {p.step}
            {p.sideTrips ? ` · +${String(p.sideTrips)} side` : ''}
            {p.status === 'here' ? ' · ◉ here' : ''}
            {p.status === 'failed' ? ' · ✕ failed' : ''}
          </button>
        </li>
      ))}
    </ol>
  );
}

export const LiveMap = createComponentImplementation(
  { name: 'LiveMap', schema: z.object({ ...Scan, follow: z.boolean().optional(), view: z.string().optional() }) },
  ({ props, context }) => {
    const scan = props.data as LiveScan | undefined;
    if (!scan) return <div className="wbx-box">Live map · waiting for scan {props.scan}</div>;
    const pick = (route: string, state: number) => act(context, 'page.select', { scan: props.scan, route, state });
    return (
      <section className="wbx-box" aria-label={`Live map of scan ${scan.short}`}>
        <div className="wbx-box__title">Live map · scan {scan.short}</div>
        <Meter meter={scan.meter} />
        {props.view !== 'filmstrip' && scan.graph && <GraphBox graph={scan.graph} scan={scan.short} onPick={(n) => pick(n.route, 1)} />}
        <Route pages={scan.pages} onPick={(p) => pick(p.route, p.state)} />
      </section>
    );
  },
);

export const ScanMeter = createComponentImplementation({ name: 'ScanMeter', schema: z.object(Scan) }, ({ props, context }) => {
  const meter = props.data as LiveScan['meter'] | undefined;
  if (!meter) return <div className="wbx-box">Scan {props.scan}</div>;
  return (
    <section className="wbx-box" aria-label="Scan progress">
      <Meter meter={meter} />
      {meter.status === 'running' && (
        <button type="button" onClick={() => act(context, 'scan.stop', { scan: props.scan })}>
          Stop…
        </button>
      )}
    </section>
  );
});

export const Narration = createComponentImplementation(
  { name: 'Narration', schema: z.object({ ...Scan, every: z.string().optional() }) },
  ({ props }) => {
    const lines = (props.data as LiveScan['narration'] | undefined) ?? [];
    return (
      <section className="wbx-box" aria-label="What the crawler did">
        <div className="wbx-box__title">Narration (from events)</div>
        {/* it scrolls: focusable so the keyboard can scroll it (axe scrollable-region-focusable) */}
        <ol className="wbx-narration" aria-live="polite" tabIndex={0}>
          {lines.map((l) => (
            <li key={l.cites[0]} data-kind={l.kind}>
              <span className="wbx-muted">{l.at.slice(11, 19)}Z</span> {l.text} <span className="wbx-muted">[{l.cites[0]?.split('#')[1]}]</span>
            </li>
          ))}
        </ol>
      </section>
    );
  },
);

export const ErrorCard = createComponentImplementation({ name: 'ErrorCard', schema: z.object(Scan) }, ({ props, context }) => {
  const stop = props.data as LiveScan['stop'] | undefined;
  if (!stop) return null;
  return (
    <section className="wbx-box wbx-box--failed" aria-label="Scan stopped">
      <div className="wbx-box__title">Scan stopped{stop.route ? ` at ${stop.route}` : ''}</div>
      <p>{stop.reason ?? 'No reason recorded.'}</p>
      <p className="wbx-muted">
        Kept: {stop.kept.pages} pages, {stop.kept.queued} queued
      </p>
      <button type="button" onClick={() => act(context, 'scan.resume', { scan: props.scan })}>
        Resume…
      </button>
    </section>
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
  if (!page) return <div className="wbx-box wbx-muted">Pick a page on the map to see it here.</div>;
  return (
    <section className="wbx-box" aria-label="Selected page">
      <div className="wbx-box__title">
        {page.route} — {page.title}
      </div>
      <p>
        Visited as #{page.order} at step {page.step} ({page.at}); {page.sideTrips} side pages; {page.status}.
      </p>
      <p className="wbx-muted">Your next message carries this page as context.</p>
    </section>
  );
});

export const PageMiniature = createComponentImplementation({ name: 'PageMiniature', schema: PageSchema }, ({ props }) => {
  const page = pageOf((props.data as LivePage[] | undefined) ?? [], props.page, null);
  return <div className="wbx-box">Page {page ? `${page.route} — ${page.title}` : '(not visited)'}</div>;
});
