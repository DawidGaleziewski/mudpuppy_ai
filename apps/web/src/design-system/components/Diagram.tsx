import { useEffect, useId, useState } from 'react';

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

export interface DiagramProps {
  /** The Mermaid source: also the text alternative, shown until the picture is drawn. */
  source: string;
  /** What the diagram shows, above it. */
  caption: string;
  /** Where Mermaid is served (the dashboard's vendored copy). */
  script?: string;
}

/**
 * A Mermaid diagram (a process map) drawn in the Salvage Yard tokens. Mermaid loads only when a
 * diagram is shown; until it is drawn, and if it cannot be, the source is shown as text.
 */
export function Diagram({ source, caption, script = '/static/vendor/mermaid.min.js' }: DiagramProps) {
  const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadMermaid(script)
      .then((m) => m.render(id, source))
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
  return (
    <figure className="sy-stack">
      <figcaption className="sy-label">{caption}</figcaption>
      {svg === null ? (
        <pre className="sy-code">{source}</pre>
      ) : (
        // Mermaid's own SVG, rendered with securityLevel strict (no scripts, no HTML labels)
        <div role="img" aria-label={caption} dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </figure>
  );
}
