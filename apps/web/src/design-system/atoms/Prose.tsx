import type { CSSProperties, MouseEvent } from 'react';

export interface ProseProps {
  /**
   * A document the dashboard rendered from markdown without raw HTML (record text never becomes
   * markup): the documentation export's files.
   */
  html: string;
  /** A click on one of its links to a page of the app: the app moves there itself (no page load). */
  onLink?: (href: string) => void;
  label?: string;
}

// Layout only: long recorded URLs break anywhere instead of widening the page.
const WRAP: CSSProperties = { overflowWrap: 'anywhere', minWidth: 0 };

/** A rendered document (headings, lists, tables that scroll inside, code) in the reading measure. */
export function Prose({ html, onLink, label }: ProseProps) {
  const click = (e: MouseEvent<HTMLElement>) => {
    const a = e.target instanceof Element ? e.target.closest('a') : null;
    const href = a?.getAttribute('href');
    if (!onLink || !a || !href?.startsWith('/app/') || a.hasAttribute('download') || e.ctrlKey || e.metaKey || e.button !== 0) return;
    e.preventDefault();
    onLink(href);
  };
  return <article className="sy-stack" style={WRAP} aria-label={label} onClick={click} dangerouslySetInnerHTML={{ __html: html }} />;
}
