import {
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
}

const MIN = 0.3;
const MAX = 1.6;
const STEP = 1.25;
const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));

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

/**
 * A graph whose layout the API made (the portal map): edges as SVG paths in their state, nodes as
 * `GraphNode` buttons at their place. Zoom out, fit and in; arrow keys move from a node to the
 * neighbour that way. It opens on the selected node or the top row. The text version (a table) is
 * the caller's: a graph is never the only way to the facts.
 */
export function Graph({ label, width, height, edges, children }: GraphProps) {
  const box = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const nodes = [...el.querySelectorAll<HTMLElement>('[data-node]')];
    const target =
      el.querySelector<HTMLElement>('[data-node][aria-pressed="true"]') ??
      nodes.reduce<HTMLElement | undefined>((a, b) => (a === undefined || b.offsetTop < a.offsetTop ? b : a), undefined);
    if (target) el.scrollLeft = target.offsetLeft + target.offsetWidth / 2 - el.clientWidth / 2;
  }, []);
  const fit = () => {
    const el = box.current;
    if (el && width > 0) setScale(clamp((el.clientWidth - 32) / width));
  };
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = DIRS[e.key];
    const node = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-node]') : null;
    if (!dir || !node) return;
    const to = neighbour(e.currentTarget, node, dir);
    if (!to) return;
    e.preventDefault();
    to.focus();
  };
  // layout only: the canvas size and the zoom (the designer's markup puts the size inline)
  const canvas: CSSProperties = { width, height, zoom: scale };
  return (
    <div className="sy-stack">
      <div className="sy-cluster" role="group" aria-label="Zoom">
        <button className="sy-btn sy-btn--sm" type="button" aria-label="Zoom out" onClick={() => setScale((s) => clamp(s / STEP))}>
          −
        </button>
        <button className="sy-btn sy-btn--sm" type="button" onClick={fit}>
          Fit
        </button>
        <button className="sy-btn sy-btn--sm" type="button" aria-label="Zoom in" onClick={() => setScale((s) => clamp(s * STEP))}>
          +
        </button>
      </div>
      {/* layout only: a tall graph scrolls inside its box (the htmx map's 75vh) */}
      <section className="sy-graph" aria-label={label} ref={box} style={{ maxBlockSize: '75vh' }}>
        <div className="sy-graph__canvas" style={canvas} onKeyDown={move}>
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
}: GraphNodeProps) {
  // layout only: the API placed the node
  const place: CSSProperties = { left: x, top: y, height };
  const common = { 'data-node': id, 'data-near': near.join(' '), style: place };
  if (href !== undefined)
    return (
      <a {...common} className={cx('sy-node sy-node--deck', dim && 'sy-node--dim')} href={href}>
        <span className="sy-node__route">{route}</span>
        <span className="sy-node__title">{title}</span>
      </a>
    );
  return (
    <button
      {...common}
      type="button"
      className={cx('sy-node', process && 'sy-node--process', dim && 'sy-node--dim')}
      data-state={state}
      aria-pressed={pressed}
      onClick={onSelect}
    >
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
