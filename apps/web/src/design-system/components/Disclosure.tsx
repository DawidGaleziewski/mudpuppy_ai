import type { ReactNode } from 'react';

/** A summary that opens a body (`details`): a JSON shape, a long detail kept out of the way. */
export function Disclosure({ summary, children, open = false }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="sy-disclosure" open={open}>
      <summary>{summary}</summary>
      <div className="sy-disclosure__body">{children}</div>
    </details>
  );
}
