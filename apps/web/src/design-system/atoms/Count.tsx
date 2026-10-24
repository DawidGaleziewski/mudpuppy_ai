import type { ReactNode } from 'react';
import { cx } from '../cx.js';

/** A count beside a label or a nav item. Orange (not muted) only where a person must act. */
export function Count({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <span className={cx('sy-count', muted && 'sy-count--muted')}>{children}</span>;
}
