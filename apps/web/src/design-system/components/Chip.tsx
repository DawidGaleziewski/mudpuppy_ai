import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface ChipProps {
  children: ReactNode;
  /** `fail`: a failure mark; `ok`: passed; `tobe`: drawn, not built; `dashed`: a beta or a placeholder. */
  variant?: 'fail' | 'ok' | 'tobe' | 'dashed';
}

/** A small mark beside a name: "beta", "Start here", "probe". */
export function Chip({ children, variant }: ChipProps) {
  return <span className={cx('sy-chip', variant && `sy-chip--${variant}`)}>{children}</span>;
}
