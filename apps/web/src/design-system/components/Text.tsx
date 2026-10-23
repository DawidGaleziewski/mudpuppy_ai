import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface TextProps {
  children: ReactNode;
  /** An identifier, a route, a timestamp: the mono face. */
  mono?: boolean;
  /** Secondary text. */
  muted?: boolean;
  small?: boolean;
  /** A paragraph instead of a run of text inside a line. */
  block?: boolean;
}

/** Inline text in one of the system's faces and tones: pages never set a face or a size themselves. */
export function Text({ children, mono = false, muted = false, small = false, block = false }: TextProps) {
  const className = cx(mono && 'sy-mono', muted && 'sy-muted', small && 'sy-small') || undefined;
  return block ? <p className={className}>{children}</p> : <span className={className}>{children}</span>;
}
