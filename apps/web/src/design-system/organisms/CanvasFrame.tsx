import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Button } from '../atoms/Button.js';
import { cx } from '../cx.js';
import { Split } from '../layout/Layout.js';
import { OVERVIEW, useCanvas, type View } from '../molecules/canvas.js';
import { Kbd } from '../molecules/Choice.js';
import { ZoomBar } from '../molecules/zoom.js';
import { Dialog } from './Dialog.js';

/** A box in the drawing's own coordinates (at 100 %). */
export interface DrawingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasFrameProps {
  /** What the canvas shows, for assistive technology ("Map of liveinsurer now"). */
  label: string;
  /** The full-screen dialog's heading ("Scan 01a110d5-2028 · map"). */
  title?: string;
  /** The drawing's size at 100 %. */
  width: number;
  height: number;
  /** Inside another page: at most 520 px tall; by default as tall as the screen below the header. */
  embedded?: boolean;
  /** Mermaid's SVG (T-09): `.sy-diagram`, `.sy-graphview--diagram`. */
  diagram?: boolean;
  /** "Zoom the map", "Zoom the diagram". */
  zoomLabel?: string;
  /** In the Workbench F means focus mode: full screen is the button only. */
  noFKey?: boolean;
  /** The zoom it opens at when Fit would be under 80 %: a diagram opens at 100 % (T-09). */
  openZoom?: number;
  /** The box to open on (the start page, the selected node), in drawing coordinates. */
  openOn?: (canvas: HTMLElement) => DrawingBox | null;
  /** The drawing's own keys first (a graph's arrows move between nodes); true when used. */
  onKey?: (e: KeyboardEvent<HTMLElement>) => boolean;
  /** A click on the drawing at a scale under 50 % (the overview): a node there zooms to 100 % on it. */
  onOverviewClick?: (e: MouseEvent<HTMLDivElement>, show: (r: DrawingBox, z: number) => void) => void;
  /** The drawing: edges and nodes, or Mermaid's SVG (drawn with `html`). */
  children?: ReactNode;
  html?: string;
}

const HINT = { rest: 'Click to zoom with the wheel · Drag pans', engaged: 'Wheel zooms · Drag pans · Esc to leave', full: 'Wheel zooms · Drag pans' } as const;

function hintOf(full: boolean, engaged: boolean): keyof typeof HINT {
  if (full) return 'full';
  return engaged ? 'engaged' : 'rest';
}

interface CanvasProps extends CanvasFrameProps {
  /** Full screen: always engaged; opens at `initial`; tells its view back on close. */
  full?: { initial: View; expose: (view: () => View) => void } | undefined;
  /** Opens full screen (none inside it). */
  onFull?: (v: View) => void;
  /** The view after a full screen closed, to carry back. */
  back?: View | null;
}

/** The hint: at rest on hover only; engaged, until 3 s after the last zoom. */
function useHint(engaged: boolean, z: number) {
  const [hover, setHover] = useState(false);
  // the engagement and scale the 3 s ran out on: a new zoom shows the hint again
  const [quietOn, setQuietOn] = useState('');
  const now = `${String(engaged)}:${String(z)}`;
  useEffect(() => {
    if (!engaged) return;
    const t = window.setTimeout(() => setQuietOn(now), 3000);
    return () => window.clearTimeout(t);
  }, [engaged, now]);
  return { shown: engaged ? quietOn !== now : hover, setHover };
}

/** The drawing the view moves: nodes and edges, or Mermaid's SVG. */
function Drawing({ p, drawing, click }: { p: CanvasProps; drawing: RefObject<HTMLDivElement | null>; click: (e: MouseEvent<HTMLDivElement>) => void }) {
  // layout only: the drawing's size at 100 % (the view scales it)
  const size: CSSProperties = { width: p.width, height: p.height };
  if (p.html !== undefined)
    // Mermaid's own SVG, rendered with securityLevel strict (no scripts, no HTML labels)
    return <div ref={drawing} className="sy-graph__canvas" style={size} role="img" aria-label={p.label} onClickCapture={click} dangerouslySetInnerHTML={{ __html: p.html }} />;
  return (
    <div ref={drawing} className="sy-graph__canvas" style={size} onClickCapture={click}>
      {p.children}
    </div>
  );
}

/** The frame's classes: embedded, a diagram, full screen. */
const frameClass = (p: CanvasProps) =>
  cx('sy-graphview', p.embedded && !p.full && 'sy-graphview--embedded', p.diagram && 'sy-graphview--diagram', p.full && 'sy-graphview--full');

function Canvas(p: CanvasProps) {
  const id = useId();
  const c = useCanvas({
    width: p.width,
    height: p.height,
    always: p.full !== undefined,
    ...(p.full && { initial: p.full.initial }),
    ...(p.openZoom !== undefined && { openZoom: p.openZoom }),
    ...(p.openOn && { openOn: p.openOn }),
    ...(p.onFull && !p.noFKey && { onFullScreen: p.onFull }),
  });
  const { box, drawing } = c;
  const { shown, setHover } = useHint(c.engaged, c.view.z);
  // full screen hands its view out, so closing it can carry the view back to the page's canvas (T-08)
  const expose = p.full?.expose;
  const { current, jump } = c;
  useEffect(() => expose?.(current), [expose, current]);
  const { back } = p;
  useEffect(() => {
    if (back) jump(back);
  }, [back, jump]);
  const overview = c.view.z < OVERVIEW;
  const keys = (e: KeyboardEvent<HTMLElement>) => {
    if (p.onKey?.(e) || c.keys(e)) e.preventDefault();
  };
  const blur = (e: FocusEvent<HTMLElement>) => {
    if (!box.current?.contains(e.relatedTarget)) c.release();
  };
  const click = (e: MouseEvent<HTMLDivElement>) => {
    // the click that ends a drag never selects a node
    if (c.dragged()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (overview) p.onOverviewClick?.(e, c.show);
  };
  // layout only: the box's natural height (the frame caps it)
  const natural: CSSProperties | undefined = p.full ? undefined : { height: Math.round(p.height * Math.min(1, c.view.z)) + 48 };
  return (
    <div className={frameClass(p)}>
      <ZoomBar
        controls={id}
        scale={c.view.z}
        fitted={c.fitted}
        zoom={(z) => c.zoomTo(z)}
        fit={c.fit}
        {...(p.zoomLabel !== undefined && { label: p.zoomLabel })}
        {...(p.onFull && { full: () => p.onFull?.(c.current()) })}
      />
      <span className="sy-sr-only" aria-live="polite">
        {c.said}
      </span>
      <section
        id={id}
        ref={box}
        className={cx('sy-graph sy-graph--canvas', overview && 'sy-graph--overview', p.diagram && 'sy-diagram')}
        aria-label={p.label}
        tabIndex={0}
        data-engaged={c.engaged ? '' : undefined}
        data-panning={c.panning ? '' : undefined}
        style={natural}
        onFocus={c.engage}
        onBlur={blur}
        onKeyDown={keys}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}>
        <Drawing p={p} drawing={drawing} click={click} />
        {shown && (
          <span className="sy-graph__hint" aria-hidden="true">
            {HINT[hintOf(p.full !== undefined, c.engaged)]}
          </span>
        )}
      </section>
    </div>
  );
}

/**
 * A canvas in the graph's frame (designer T-07, T-08, D-71, D-72): the zoom bar (−, level, +,
 * Fit, Full screen), the box the drawing moves in by transform, the hint, and full screen as a
 * dialog with the same canvas, always engaged, carrying the zoom and position both ways. Graph and
 * Diagram are this frame with their own drawing.
 */
export function CanvasFrame(props: CanvasFrameProps) {
  const [full, setFull] = useState<View | null>(null);
  const [back, setBack] = useState<View | null>(null);
  const heading = useId();
  const inside = useRef<(() => View) | null>(null);
  const expose = useCallback((view: () => View) => {
    inside.current = view;
  }, []);
  const close = () => {
    setBack(inside.current?.() ?? null);
    setFull(null);
  };
  return (
    <>
      <Canvas {...props} onFull={setFull} back={back} />
      <Dialog open={full !== null} onClose={close} labelledBy={heading} size="full">
        <Dialog.Head>
          <Split>
            <h2 id={heading} className="sy-h3">
              {props.title ?? props.label}
            </h2>
            <Button size="md" onClick={close}>
              Exit full screen <Kbd>Esc</Kbd>
            </Button>
          </Split>
        </Dialog.Head>
        {full && <Canvas {...props} embedded={false} full={{ initial: full, expose }} />}
      </Dialog>
    </>
  );
}
