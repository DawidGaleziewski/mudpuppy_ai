import type { ReactNode } from 'react';
import { cx } from '../cx.js';

/** A list of rows in a plate (scans, records, questions). */
export function Rows({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="sy-rows" aria-label={label}>
      {children}
    </ul>
  );
}

export interface RowProps {
  children: ReactNode;
  /** Things at the right: a status, a count, a quiet button. */
  aside?: ReactNode;
  /** The row of the thing shown now. */
  current?: boolean;
  /** `intent`: needs a person; `muted`: retired or skipped; `dashed`: queued or not observed. */
  tone?: 'intent' | 'muted' | 'dashed';
}

export function Row({ children, aside, current = false, tone }: RowProps) {
  return (
    <li
      className={cx('sy-row', current && 'sy-row--current', tone && `sy-row--${tone}`)}
      aria-current={current || undefined}
    >
      <div className="sy-row__main">{children}</div>
      {aside}
    </li>
  );
}
