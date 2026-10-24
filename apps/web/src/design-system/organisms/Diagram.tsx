import { useEffect, useId, useState } from 'react';
import { CanvasFrame } from './CanvasFrame.js';

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

/**
 * The designer's Mermaid theme (T-09, D-73), from the role tokens: nodes are steel plates with a
 * control-edge border and chalk text, edges ash, subgraphs a weld line with no fill; no colours but
 * the status classes. `htmlLabels: false` keeps the SVG self-contained so the canvas scales it
 * crisply; `strict` because labels come from portal data.
 */
function theme(m: Mermaid): Mermaid {
  if (!themed.has(m)) {
    themed.add(m);
    m.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: token('--sy-font-sans'),
      fontSize: 13,
      themeVariables: {
        darkMode: true,
        background: token('--sy-bg-plate'),
        primaryColor: token('--sy-bg-raised'),
        primaryBorderColor: token('--sy-border-control'),
        primaryTextColor: token('--sy-text'),
        lineColor: token('--sy-text-muted'),
        secondaryColor: token('--sy-bg-plate'),
        tertiaryColor: token('--sy-bg-plate'),
        clusterBkg: 'transparent',
        clusterBorder: token('--sy-border-weld'),
        edgeLabelBackground: token('--sy-bg-plate'),
        titleColor: token('--sy-text'),
        textColor: token('--sy-text'),
      },
      flowchart: { curve: 'basis', nodeSpacing: 28, rankSpacing: 48, htmlLabels: false },
    });
  }
  return m;
}

/** The status classes a flowchart may use (`:::failed`): red = failed, dashed = not observed, chalk = the root. */
const statusClasses = () =>
  [
    `classDef failed stroke:${token('--sy-fail')},stroke-width:2px;`,
    `classDef unreached stroke-dasharray:5 4,color:${token('--sy-text-muted')};`,
    `classDef current stroke:${token('--sy-text')},stroke-width:2px;`,
  ].join('\n');

/**
 * The source as Mermaid should read it: a label that starts "1. kind: intent" (a process map's
 * step) is read as a Markdown list, which Mermaid draws as "Unsupported markdown: list" (spec 056
 * finding), so its number's dot is escaped; a flowchart gets the status classes. Only what is
 * drawn changes; the stored source does not.
 */
export const drawable = (source: string) => source.replace(/(["[({]\s*)(\d+)\. /g, '$1$2\\. ');

const withClasses = (source: string) => (/^\s*(flowchart|graph)\b/.test(source) ? `${source}\n${statusClasses()}` : source);

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
 * map's frame (R-103 (9), designer T-09): the canvas frame with its zoom bar and full screen, moving
 * as the map does (drag pans, the wheel zooms once engaged). Rendered once to SVG at its natural
 * size; the canvas scales it. It opens readable: fitted when that is 80 % or more, else 100 % at
 * its top-left, where its flow starts.
 * Mermaid loads only when a diagram is shown; until it is drawn, and if it cannot be, the source
 * is shown as text.
 */
export function Diagram({ source, caption, script = '/app/vendor/mermaid.min.js', embedded = false }: DiagramProps) {
  const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadMermaid(script)
      .then((m) => m.render(id, withClasses(drawable(source))))
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
        <CanvasFrame label={caption} width={size.width} height={size.height} embedded={embedded} diagram zoomLabel="Zoom the diagram" openZoom={1} openOn={topLeft} html={svg} />
      )}
    </figure>
  );
}

/** A diagram starts at its top-left (left-to-right and top-down flows start there). */
const topLeft = () => ({ x: 0, y: 0, w: 0, h: 0 });
