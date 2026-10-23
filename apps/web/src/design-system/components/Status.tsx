import type { ReactNode } from 'react';
import { cx } from '../cx.js';
import { STATUS_WORD, type StatusKind } from '../status.js';

export interface StatusProps {
  status: StatusKind;
  /** The word to show; the status's default word when left out ("Needs you", "Running"). */
  children?: ReactNode;
  /** Without the shape's frame, for dense tables. */
  plain?: boolean;
}

/** A status: a shape and a word, never a colour alone (rule 8). */
export function Status({ status, children, plain = false }: StatusProps) {
  return (
    <span className={cx('sy-status', plain && 'sy-status--plain')} data-status={status}>
      {children ?? STATUS_WORD[status]}
    </span>
  );
}
