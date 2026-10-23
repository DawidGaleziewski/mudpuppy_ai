import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface CalloutProps {
  /** `intent`: a person must act. `failure`: what failed, its reference and the next move. `ok`: done. `drawn`: a proposal. */
  tone?: 'intent' | 'failure' | 'ok' | 'drawn';
  title?: ReactNode;
  children: ReactNode;
  /** Announced to screen readers when it appears (errors and results that arrive later). */
  live?: boolean;
}

/** A message inside a view: counts first, then the next move (voice). */
export function Callout({ tone, title, children, live = false }: CalloutProps) {
  const liveRole = tone === 'failure' ? 'alert' : 'status';
  return (
    <div
      className={cx('sy-callout', tone && `sy-callout--${tone}`)}
      role={live ? liveRole : undefined}
    >
      {title !== undefined && <span className="sy-callout__title">{title}</span>}
      {children}
    </div>
  );
}
