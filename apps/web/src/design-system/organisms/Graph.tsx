import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../cx.js';
import { Anchor } from '../atoms/Anchor.js';
import { clamp, OVERVIEW, pct, READABLE, stepIn, stepOut, usePointerZoom, ZoomBar } from '../molecules/zoom.js';

/** One edge, drawn by the caller's data (the dashboard lays the graph out, never the app). */
export interface GraphEdge {
  /** The SVG path. */
  d: string;
  /** The edge's state modifier (`sy-edge--<state>`): unseen, unchecked, retired, changed, process, failed…; none: active. */
  state?: string | null | undefined;
  /** A short text at (`labelX`, `labelY`): the condition that decides the link. */
  label?: string | undefined;
  labelX?: number | undefined;
  labelY?: number | undefined;
  /** An arrowhead (`.sy-edge-arrow`) at the page the move went to, or at both ends (a move off
   * the tree on the recorded map, designer 18/10). */
  arrow?: 'end' | 'both' | undefined;
}

/** The arrowhead marker, in the graph's own `<defs>` with an id unique on the page. */
function ArrowDef({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
        <path className="sy-edge-arrow" d="M1 1 7 4 1 7" />
      </marker>
    </defs>
  );
}

/** The graph's edges and their labels: decoration, the caller's table carries the facts. */
function Edges({ edges, arrowId }: { edges: readonly GraphEdge[]; arrowId: string }) {
  return (
    <svg className="sy-graph__edges" aria-hidden="true" focusable="false">
      {edges.some((e) => e.arrow) && <ArrowDef id={arrowId} />}
      {edges.map((e, i) => (
        <path key={i} className={cx('sy-edge', e.state && `sy-edge--${e.state}`)} d={e.d} {...arrowAttrs(e.arrow, arrowId)} />
      ))}
      {edges.map(
        (e, i) =>
          e.label && (
            <text key={`l${String(i)}`} className={cx('sy-edge-label', e.state === 'failed' && 'sy-edge-label--failed')} x={e.labelX} y={e.labelY} textAnchor="middle">
              {e.label}
            </text>
          ),
      )}
    </svg>
  );
}

/** A marker id from a React id, safe inside `url(#…)`. */
const markerId = (id: string) => `arrow-${id.replace(/[^\w-]/g, '')}`;

const arrowAttrs = (arrow: GraphEdge['arrow'], id: string) => {
  if (!arrow) return {};
  const url = `url(#${id})`;
  return arrow === 'both' ? { markerStart: url, markerEnd: url } : { markerEnd: url };
};

export interface GraphProps {
  /** What the graph shows, for assistive technology ("Map of liveinsurer now"). */
  label: string;
  /** The canvas size the layout needs, in px. */
  width: number;
  height: number;
  edges: readonly GraphEdge[];
  /** `GraphNode`s. */
  children: ReactNode;
  /** Inside another page (a scan's graph, the recorded map): at most 520 px tall. By default the
   * graph is a page's map, as tall as the screen below the header. */
  embedded?: boolean;
}

/** The arrow keys' directions. */
const DIRS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const centre = (el: Element): [number, number] => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};

/** Of `node`'s neighbours (`data-near`), the one that lies most in direction `dir`. */
function neighbour(canvas: HTMLElement, node: HTMLElement, dir: readonly [number, number]) {
  const [x, y] = centre(node);
  const near = new Set((node.dataset.near ?? '').split(' ').filter(Boolean));
  let best: HTMLElement | null = null;
  let bestScore = -Infinity;
  for (const other of canvas.querySelectorAll<HTMLElement>('[data-node]')) {
    if (!near.has(other.dataset.node ?? '')) continue;
    const [ox, oy] = centre(other);
    const [dx, dy] = [ox - x, oy - y];
    const along = dx * dir[0] + dy * dir[1];
    const score = along - Math.abs(dx * dir[1] + dy * dir[0]) / 2;
    if (along > 0 && score > bestScore) [best, bestScore] = [other, score];
  }
  return best;
}

/** The top-left node of the layered layout: the start page. */
const isBefore = (a: HTMLElement, b: HTMLElement) => b.offsetTop < a.offsetTop || (b.offsetTop === a.offsetTop && b.offsetLeft < a.offsetLeft);

/** The selected node, else the start page (top row, leftmost): what the graph opens on. */
function focusNode(el: HTMLElement) {
  const nodes = [...el.querySelectorAll<HTMLElement>('[data-node]')];
  return (
    el.querySelector<HTMLElement>('[data-node][aria-pressed="true"]') ??
    nodes.reduce<HTMLElement | undefined>((a, b) => (a === undefined || isBefore(a, b) ? b : a), undefined)
  );
}

/** Scroll the box so `node` is in view; `centre`: centred even when it already is. */
function bringIntoView(el: HTMLElement, node: HTMLElement | null | undefined, centre = false) {
  if (!node) return;
  const [b, n] = [el.getBoundingClientRect(), node.getBoundingClientRect()];
  if (centre || n.left < b.left || n.right > b.right) el.scrollLeft += n.left + n.width / 2 - (b.left + b.width / 2);
  if (centre || n.top < b.top || n.bottom > b.bottom) el.scrollTop += n.top + n.height / 2 - (b.top + b.height / 2);
}

/** Opening zoom (round-3 Q3): fit, but never below readable and never above 100 %. */
const openZoom = (fit: number) => (fit >= READABLE ? Math.min(fit, 1) : READABLE);

/** The graph's keys: + / − zoom, 0 back to 100 %, an arrow moves to the neighbour that way. */
const graphKeys = (scale: number, zoom: (s: number) => void) => (e: KeyboardEvent<HTMLDivElement>) => {
  const to = { '+': stepIn(scale), '=': stepIn(scale), '-': stepOut(scale), '0': 1 }[e.key];
  if (to !== undefined) {
    e.preventDefault();
    zoom(to);
    return;
  }
  const dir = DIRS[e.key];
  const node = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-node]') : null;
  if (!dir || !node) return;
  const next = neighbour(e.currentTarget, node, dir);
  if (!next) return;
  e.preventDefault();
  next.focus();
};

/**
 * A graph whose layout the API made (the portal map): edges as SVG paths in their state, nodes as
 * `GraphNode` buttons at their place, in a `.sy-graphview` frame (design answer Q4): as tall as
 * the graph, at most the screen below the header (520 px when `embedded`), with a zoom bar that
 * stays in view while the graph does. It opens readable (round-3 Q3): fitted when that is 80 %
 * or more, else at 80 % scrolled to the selected node or the start page (top-left). Fit shows the
 * whole map at any zoom; under 50 % it is an overview (`.sy-graph--overview`: the boxes keep their
 * state, their words fade but stay for screen readers), where clicking a node zooms to 100 % on
 * it. Keys in the graph: + / − zoom, 0 back to 100 %, arrows move to the neighbour that way. The
 * text version (a table) is the caller's: a graph is never the only way to the facts.
 */
export function Graph({ label, width, height, edges, children, embedded = false }: GraphProps) {
  const id = useId();
  const arrowId = markerId(id);
  const box = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const [fitted, setFitted] = useState(false);
  const [said, setSaid] = useState('');
  // The node to centre after the next zoom: the open's start page, or the node clicked in overview.
  const centreOn = useRef<HTMLElement | null>(null);
  const fitScale = () => {
    const el = box.current;
    return el && width > 0 && el.clientWidth > 0 ? clamp((el.clientWidth - 32) / width) : 1;
  };
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const target = focusNode(el);
    if (el.clientWidth > 0 && width > el.clientWidth) {
      const fit = fitScale();
      setScale(openZoom(fit));
      setFitted(fit >= READABLE);
    }
    centreOn.current = target ?? null;
    bringIntoView(el, target, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open: later the person zooms and pans
  }, []);
  const zoom = useCallback((s: number) => {
    setScale(s);
    setFitted(false);
    setSaid(`Zoom ${pct(s)}`);
  }, []);
  // after a zoom from the bar or the keys: the node to centre, else keep the selected one in view
  // (a wheel or pinch zoom keeps the point under the pointer instead)
  const afterZoom = useCallback((el: HTMLElement) => {
    if (centreOn.current) bringIntoView(el, centreOn.current, true);
    else bringIntoView(el, el.querySelector<HTMLElement>('[data-node][aria-pressed="true"]'));
    centreOn.current = null;
  }, []);
  usePointerZoom(box, scale, zoom, afterZoom);
  const overview = scale < OVERVIEW;
  // In overview a click on a node also zooms to 100 % centred on it (the node's own click selects it).
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overview || !(e.target instanceof HTMLElement)) return;
    const node = e.target.closest<HTMLElement>('button[data-node]');
    if (!node) return;
    centreOn.current = node;
    zoom(1);
  };
  const fit = () => {
    const s = fitScale();
    setScale(s);
    setFitted(true);
    setSaid(`Zoom ${pct(s)}, fitted`);
  };
  const keys = graphKeys(scale, zoom);
  // layout only: the canvas size and the zoom (the designer's markup puts the size and scale inline)
  const canvas: CSSProperties = { width, height, zoom: scale };
  return (
    <div className={cx('sy-graphview', embedded && 'sy-graphview--embedded')}>
      <ZoomBar controls={id} scale={scale} fitted={fitted} zoom={zoom} fit={fit} />
      <span className="sy-sr-only" aria-live="polite">
        {said}
      </span>
      <section id={id} className={cx('sy-graph', overview && 'sy-graph--overview')} aria-label={label} ref={box}>
        <div className="sy-graph__canvas" style={canvas} onKeyDown={keys} onClickCapture={onClickCapture}>
          <Edges edges={edges} arrowId={arrowId} />
          {children}
        </div>
      </section>
    </div>
  );
}

export interface GraphNodeProps {
  /** The node's id: what its neighbours name in `near`. */
  id: string;
  x: number;
  y: number;
  /** The fixed height the layout counted with. */
  height?: number;
  /** The ids of its neighbours (arrow keys move there). */
  near?: readonly string[];
  /** The route, in mono. */
  route: ReactNode;
  /** The title (one line, cut; `fullTitle` on hover). */
  title: ReactNode;
  fullTitle?: string;
  /** Statuses and chips under the title. */
  meta?: ReactNode;
  /** Selected: its details are open beside the graph. */
  pressed?: boolean;
  onSelect?: () => void;
  /** A node that opens something else (a folded family): a link, drawn as a deck of plates. */
  href?: string;
  /** Bold: a step of the overlaid process. */
  process?: boolean;
  /** Faint: outside the overlay, or unchanged. */
  dim?: boolean;
  /** `data-state`: retired, failed, unobserved, blocked, frontier; none: observed. */
  state?: string | undefined;
  /** Several states stacked on the screen (a recorded form step and its validation state). */
  deck?: boolean;
  /** Tags above the route: a mark waiting for the next scan ("Probe"), "Stopped here". */
  marks?: ReactNode;
}

/** A node of a `Graph`: a button that selects it, or a link for a folded deck. */
export function GraphNode({
  id,
  x,
  y,
  height,
  near = [],
  route,
  title,
  fullTitle,
  meta,
  pressed = false,
  onSelect,
  href,
  process = false,
  dim = false,
  state,
  deck = false,
  marks,
}: GraphNodeProps) {
  // layout only: the API placed the node
  const place: CSSProperties = { left: x, top: y, height };
  const common = { 'data-node': id, 'data-near': near.join(' '), style: place };
  if (href !== undefined)
    return (
      <Anchor {...common} className={cx('sy-node sy-node--deck', dim && 'sy-node--dim')} href={href} data-state={state}>
        <span className="sy-node__route">{route}</span>
        <span className="sy-node__title">{title}</span>
        {meta !== undefined && <span className="sy-node__meta">{meta}</span>}
      </Anchor>
    );
  return (
    <button
      {...common}
      type="button"
      className={cx('sy-node', deck && 'sy-node--deck', process && 'sy-node--process', dim && 'sy-node--dim')}
      data-state={state}
      aria-pressed={pressed}
      onClick={onSelect}
    >
      {marks !== undefined && <span className="sy-node__marks">{marks}</span>}
      <span className="sy-node__route">{route}</span>
      <span className="sy-node__title sy-truncate" title={fullTitle}>
        {title}
      </span>
      {meta !== undefined && <span className="sy-node__meta">{meta}</span>}
    </button>
  );
}

export interface LegendProps {
  /** What the swatches stand for ("Link states"). */
  label: string;
  /** Each edge state (`GraphEdge.state`, '' for the plain edge) with its word. */
  items: readonly { state: string; label: string }[];
}

/** Edge states drawn with an arrowhead (the swatch shows it too). */
const ARROWED = new Set(['offtree']);

/** The legend of a `Graph`'s edges: a swatch of each state with its word. */
export function Legend({ label, items }: LegendProps) {
  const arrow = markerId(useId());
  return (
    <ul className="sy-legend" aria-label={label}>
      {items.map((it) => (
        <li key={it.state} className="sy-legend__item">
          <svg width="28" height="10" aria-hidden="true">
            {ARROWED.has(it.state) && <ArrowDef id={arrow} />}
            <path className={cx('sy-edge', it.state && `sy-edge--${it.state}`)} d={ARROWED.has(it.state) ? 'M0 5H24' : 'M0 5H28'} {...arrowAttrs(ARROWED.has(it.state) ? 'end' : undefined, arrow)} />
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** Links the graph does not draw, said once (the menu on every page): a dashed group. */
export function Bundle({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sy-bundle" role="group" aria-label={label}>
      {children}
    </div>
  );
}
