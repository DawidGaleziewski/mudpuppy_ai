import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface TagProps {
  /** The record id, in its real case (SCR-001, BR-021 r2, a scan id). */
  children: ReactNode;
  /** Where the record lives; a tag without one is a plain label. */
  href?: string;
  /** Orange: the record needs a person (rule 2). */
  intent?: boolean;
  size?: 'sm';
  /** The whole id on hover when the tag shows a short form (a scan id). */
  title?: string;
}

/** A record id as a tagged part (rule 1): every id shown as data is a Tag. */
export function Tag({ children, href, intent = false, size, title }: TagProps) {
  const className = cx('sy-tag', intent && 'sy-tag--intent', size === 'sm' && 'sy-tag--sm');
  return href ? (
    <a className={className} href={href} title={title}>
      {children}
    </a>
  ) : (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

/** A row of tags. */
export function Tags({ children }: { children: ReactNode }) {
  return <div className="sy-tags">{children}</div>;
}
