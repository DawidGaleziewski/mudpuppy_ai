import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../cx.js';

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
}

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

/** The zoom steps (design answer Q4); Fit may go below the first. */
const STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5] as const;
const [MIN, MAX] = [0.3, 1.5];
const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));
const stepIn = (s: number) => STEPS.find((z) => z > s + 0.001) ?? s;
const stepOut = (s: number) => [...STEPS].reverse().find((z) => z < s - 0.001) ?? s;
const pct = (s: number) => `${String(Math.round(s * 100))}%`;

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

/** The selected node, else the top row's first: what the graph opens on and keeps in view. */
function focusNode(el: HTMLElement) {
  const nodes = [...el.querySelectorAll<HTMLElement>('[data-node]')];
  return (
    el.querySelector<HTMLElement>('[data-node][aria-pressed="true"]') ??
    nodes.reduce<HTMLElement | undefined>((a, b) => (a === undefined || b.offsetTop < a.offsetTop ? b : a), undefined)
  );
}

/** Scroll the box so the selected node is in view (after a zoom). */
function keepInView(el: HTMLElement) {
  const node = el.querySelector<HTMLElement>('[data-node][aria-pressed="true"]');
  if (!node) return;
  const [b, n] = [el.getBoundingClientRect(), node.getBoundingClientRect()];
  if (n.left < b.left || n.right > b.right) el.scrollLeft += n.left + n.width / 2 - (b.left + b.width / 2);
  if (n.top < b.top || n.bottom > b.bottom) el.scrollTop += n.top + n.height / 2 - (b.top + b.height / 2);
}

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

interface ZoomBarProps {
  controls: string;
  scale: number;
  fitted: boolean;
  zoom: (s: number) => void;
  fit: () => void;
}

/** The floating, sticky zoom bar (`.sy-graph__zoom`): −, the level (resets to 100 %), +, Fit. */
function ZoomBar({ controls, scale, fitted, zoom, fit }: ZoomBarProps) {
  const quiet = 'sy-btn sy-btn--sm sy-btn--quiet';
  return (
    <div className="sy-graph__zoom" role="toolbar" aria-label="Zoom the map" aria-controls={controls}>
      <button className={quiet} type="button" aria-label="Zoom out" onClick={() => zoom(stepOut(scale))}>
        −
      </button>
      <button className={`${quiet} sy-graph__zoom-level`} type="button" aria-label={`Zoom ${pct(scale)}, reset to 100%`} onClick={() => zoom(1)}>
        {pct(scale)}
      </button>
      <button className={quiet} type="button" aria-label="Zoom in" onClick={() => zoom(stepIn(scale))}>
        +
      </button>
      <button className={quiet} type="button" aria-pressed={fitted} onClick={fit}>
        Fit
      </button>
    </div>
  );
}

/**
 * A graph whose layout the API made (the portal map): edges as SVG paths in their state, nodes as
 * `GraphNode` buttons at their place, in a `.sy-graphview` frame (design answer Q4): as tall as
 * the graph, at most the screen below the header (520 px when `embedded`), with a zoom bar that
 * stays in view while the graph does. It opens fitted when wider than its box, else at 100 %,
 * on the selected node or the top row. Keys in the graph: + / − zoom, 0 back to 100 %, arrows
 * move to the neighbour that way. The text version (a table) is the caller's: a graph is never
 * the only way to the facts.
 */
export function Graph({ label, width, height, edges, children, embedded = false }: GraphProps) {
  const id = useId();
  const box = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const [fitted, setFitted] = useState(false);
  const [said, setSaid] = useState('');
  const fitScale = () => {
    const el = box.current;
    return el && width > 0 && el.clientWidth > 0 ? clamp((el.clientWidth - 32) / width) : 1;
  };
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (el.clientWidth > 0 && width > el.clientWidth) {
      setScale(fitScale());
      setFitted(true);
    }
    const target = focusNode(el);
    if (target) el.scrollLeft = target.offsetLeft + target.offsetWidth / 2 - el.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open: later the person zooms and pans
  }, []);
  useLayoutEffect(() => {
    if (box.current) keepInView(box.current);
  }, [scale]);
  const zoom = (s: number) => {
    setScale(s);
    setFitted(false);
    setSaid(`Zoom ${pct(s)}`);
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
      <section id={id} className="sy-graph" aria-label={label} ref={box}>
        <div className="sy-graph__canvas" style={canvas} onKeyDown={keys}>
          <svg className="sy-graph__edges" aria-hidden="true" focusable="false">
            {edges.map((e, i) => (
              <path key={i} className={cx('sy-edge', e.state && `sy-edge--${e.state}`)} d={e.d} />
            ))}
            {edges.map(
              (e, i) =>
                e.label && (
                  <text
                    key={`l${String(i)}`}
                    className={cx('sy-edge-label', e.state === 'failed' && 'sy-edge-label--failed')}
                    x={e.labelX}
                    y={e.labelY}
                    textAnchor="middle"
                  >
                    {e.label}
                  </text>
                ),
            )}
          </svg>
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
      <a {...common} className={cx('sy-node sy-node--deck', dim && 'sy-node--dim')} href={href} data-state={state}>
        <span className="sy-node__route">{route}</span>
        <span className="sy-node__title">{title}</span>
        {meta !== undefined && <span className="sy-node__meta">{meta}</span>}
      </a>
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

/** The legend of a `Graph`'s edges: a swatch of each state with its word. */
export function Legend({ label, items }: LegendProps) {
  return (
    <ul className="sy-legend" aria-label={label}>
      {items.map((it) => (
        <li key={it.state}>
          <svg width="28" height="10" aria-hidden="true">
            <path className={cx('sy-edge', it.state && `sy-edge--${it.state}`)} d="M0 5H28" />
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
