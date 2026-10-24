import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { cx } from '../cx.js';
import { clamp, pct, READABLE, stepIn, stepOut, usePointerZoom, ZoomBar } from '../molecules/zoom.js';

/** The part of Mermaid this component uses. */
interface Mermaid {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
}

declare global {
  interface Window {
    mermaid?: Mermaid;
  }
}

let loading: Promise<Mermaid> | null = null;
const themed = new WeakSet<Mermaid>();

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Load Mermaid once (a large script, fetched only when a diagram is shown) and theme it with the Salvage Yard tokens. */
function loadMermaid(src: string): Promise<Mermaid> {
  if (window.mermaid) return Promise.resolve(theme(window.mermaid));
  loading ??= new Promise<Mermaid>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => (window.mermaid ? resolve(window.mermaid) : reject(new Error('Mermaid did not load')));
    script.onerror = () => reject(new Error('Mermaid did not load'));
    document.head.appendChild(script);
  }).then(theme);
  loading.catch(() => {
    loading = null; // a later diagram tries again
  });
  return loading;
}

function theme(m: Mermaid): Mermaid {
  if (!themed.has(m)) {
    themed.add(m);
    m.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: token('--sy-font-mono'),
      themeVariables: {
        darkMode: true,
        background: token('--sy-bg-ground'),
        primaryColor: token('--sy-bg-raised'),
        primaryTextColor: token('--sy-text'),
        primaryBorderColor: token('--sy-border-control'),
        lineColor: token('--sy-text-muted'),
        secondaryColor: token('--sy-bg-plate'),
        tertiaryColor: token('--sy-bg-plate'),
        edgeLabelBackground: token('--sy-bg-ground'),
        textColor: token('--sy-text'),
      },
    });
  }
  return m;
}

/**
 * The source as Mermaid should read it: a label that starts "1. kind: intent" (a process map's
 * step) is read as a Markdown list, which Mermaid draws as "Unsupported markdown: list" (spec 056
 * finding), so its number's dot is escaped. Only what is drawn changes; the stored source does not.
 */
export const drawable = (source: string) => source.replace(/(["[({]\s*)(\d+)\. /g, '$1$2\\. ');

/** The drawing's own size, from its viewBox (Mermaid sizes the SVG to its box otherwise). */
function sizeOf(svg: string): { width: number; height: number } | null {
  const m = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

export interface DiagramProps {
  /** The Mermaid source: also the text alternative, shown until the picture is drawn. */
  source: string;
  /** What the diagram shows, above it. */
  caption: string;
  /** Where Mermaid is served (the console's vendored copy, `public/vendor/`). */
  script?: string;
  /** Inside another page (a record, a scan's Process tab): at most 520 px tall. */
  embedded?: boolean;
}

/**
 * A Mermaid diagram (a process map, the capability map) drawn in the Salvage Yard tokens, in the
 * map's frame (R-103 (9)): the graph view with its zoom bar (−, level, +, Fit) and the same zoom
 * as the map (Ctrl / ⌘ + wheel or a pinch at the pointer, + / − / 0 keys). It opens readable: its
 * own size when that fits, else fitted when that is 80 % or more, else 80 % from its top-left.
 * Mermaid loads only when a diagram is shown; until it is drawn, and if it cannot be, the source
 * is shown as text.
 */
export function Diagram({ source, caption, script = '/app/vendor/mermaid.min.js', embedded = false }: DiagramProps) {
  const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadMermaid(script)
      .then((m) => m.render(id, drawable(source)))
      .then((r) => {
        if (live) setSvg(r.svg);
      })
      .catch(() => {
        // the source stays: it is a readable description of the diagram
      });
    return () => {
      live = false;
    };
  }, [id, source, script]);
  const size = svg === null ? null : sizeOf(svg);
  return (
    <figure className="sy-stack">
      <figcaption className="sy-label">{caption}</figcaption>
      {svg === null || size === null ? (
        <pre className="sy-code">{source}</pre>
      ) : (
        <DiagramView id={`${id}-view`} svg={svg} size={size} caption={caption} embedded={embedded} />
      )}
    </figure>
  );
}

function DiagramView({ id, svg, size, caption, embedded }: { id: string; svg: string; size: { width: number; height: number }; caption: string; embedded: boolean }) {
  const box = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const [fitted, setFitted] = useState(false);
  const [said, setSaid] = useState('');
  const fitScale = useCallback(() => {
    const el = box.current;
    return el && el.clientWidth > 0 ? clamp((el.clientWidth - 32) / size.width) : 1;
  }, [size.width]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || el.clientWidth === 0 || size.width <= el.clientWidth) return;
    const fit = fitScale();
    setScale(fit >= READABLE ? Math.min(fit, 1) : READABLE);
    setFitted(fit >= READABLE);
  }, [fitScale, size.width]);
  const zoom = useCallback((s: number) => {
    setScale(s);
    setFitted(false);
    setSaid(`Zoom ${pct(s)}`);
  }, []);
  usePointerZoom(box, scale, zoom, keepTopLeft);
  const fit = () => {
    const s = fitScale();
    setScale(s);
    setFitted(true);
    setSaid(`Zoom ${pct(s)}, fitted`);
  };
  const keys = (e: KeyboardEvent<HTMLElement>) => {
    const to = { '+': stepIn(scale), '=': stepIn(scale), '-': stepOut(scale), '0': 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    zoom(to);
  };
  // layout only: the drawing's size and the zoom (the graph canvas's inline exception)
  const canvas: CSSProperties = { width: size.width, height: size.height, zoom: scale };
  return (
    <div className={cx('sy-graphview', embedded && 'sy-graphview--embedded')}>
      <ZoomBar controls={id} label="Zoom the diagram" scale={scale} fitted={fitted} zoom={zoom} fit={fit} />
      <span className="sy-sr-only" aria-live="polite">
        {said}
      </span>
      {/* focusable, so its keys work; the diagram is a picture, its source is the text version */}
      <section id={id} className="sy-graph" aria-label={caption} ref={box} tabIndex={0} onKeyDown={keys}>
        {/* Mermaid's own SVG, rendered with securityLevel strict (no scripts, no HTML labels) */}
        <div className="sy-graph__canvas" style={canvas} role="img" aria-label={caption} dangerouslySetInnerHTML={{ __html: svg }} />
      </section>
    </div>
  );
}

/** A diagram zoomed from the bar or the keys keeps its scroll (it has no node to keep in view). */
const keepTopLeft = () => undefined;
