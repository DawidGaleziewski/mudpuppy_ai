import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface StateProps {
  /** What is being read ("Reading the screens"), or what is missing; short, sentence case. */
  title: ReactNode;
  /** While data loads: the blinking caret after the title (the only loading mark, no spinners). */
  loading?: boolean;
  /** A load that failed (solid red frame); give the reference and the next move in `children`. */
  failure?: boolean;
  /** The counts so far, or the next move. */
  children?: ReactNode;
}

/**
 * A region's loading, empty or failed state (designer 04-design-system § States:
 * `.sy-state__title.sy-caret`, "say what is being read and the counts so far. No spinners").
 * A loading state is a polite status for screen readers.
 */
export function State({ title, loading = false, failure = false, children }: StateProps) {
  return (
    <div className={cx('sy-state', failure && 'sy-state--failure')} {...(loading ? { role: 'status' } : {})}>
      <p className={cx('sy-state__title', loading && 'sy-caret')}>{title}</p>
      {children}
    </div>
  );
}
