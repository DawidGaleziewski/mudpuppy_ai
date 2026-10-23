import type { ReactNode } from 'react';

/** A history, newest or oldest first as the caller orders it: revisions, changes, answers. */
export function Timeline({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ol className="sy-timeline" aria-label={label}>
      {children}
    </ol>
  );
}

export interface TimelineItemProps {
  /** The line's head: what happened, its status, when. */
  head: ReactNode;
  /** More about it, muted, under the head. */
  children?: ReactNode;
  /**
   * The marker: `ok` settled (green square), `draft` waiting for a person (to-be corners),
   * `live` happening now, `failed` (a cross). A plain grey square when left out.
   */
  status?: 'ok' | 'draft' | 'live' | 'failed';
}

export function TimelineItem({ head, children, status }: TimelineItemProps) {
  return (
    <li data-status={status}>
      <div className="sy-timeline__head">{head}</div>
      {children !== undefined && <div className="sy-timeline__body">{children}</div>}
    </li>
  );
}
