import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface ChipProps {
  children: ReactNode;
  /** `fail`: a failure mark; `ok`: passed; `tobe`: drawn, not built; `dashed`: a beta or a placeholder. */
  variant?: 'fail' | 'ok' | 'tobe' | 'dashed';
  /** What a terse chip means, for screen readers only ("↩ 14" → "moves back here from 9 pages"). */
  said?: string | undefined;
}

/** A small mark beside a name: "beta", "Start here", "probe". */
export function Chip({ children, variant, said }: ChipProps) {
  const chip = <span className={cx('sy-chip', variant && `sy-chip--${variant}`)}>{children}</span>;
  if (said === undefined) return chip;
  return (
    <>
      {chip}
      <span className="sy-sr-only">{`, ${said}`}</span>
    </>
  );
}
