import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface NoteProps {
  /** What a person wrote, exactly as they wrote it. */
  children: ReactNode;
  /** Who wrote it, and when. */
  by?: ReactNode;
  size?: 'sm';
}

/** Human text (rule 4: humans type, machines print). Never use it for machine output. */
export function Note({ children, by, size }: NoteProps) {
  return (
    <span className={cx('sy-note', size === 'sm' && 'sy-note--sm')}>
      {children}
      {by !== undefined && <span className="sy-note__by">{by}</span>}
    </span>
  );
}
