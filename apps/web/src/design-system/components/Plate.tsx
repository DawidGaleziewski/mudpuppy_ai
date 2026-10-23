import { useId, type ReactNode } from 'react';
import { cx } from '../cx.js';

export interface PlateProps {
  /** The plate's title, in its head; leave out for a plate without one. */
  title?: ReactNode;
  /** Things at the right of the head: a count, a quiet button. */
  actions?: ReactNode;
  /** Its foot: the plate's actions. */
  foot?: ReactNode;
  /**
   * `intent`: the one plate of a view that needs a person (at most one, rule 2). `failure`: what
   * failed. `drawn`: the to-be, drafted or inferred (rule 3).
   */
  variant?: 'intent' | 'failure' | 'drawn';
  /** Body without padding, for a list or a table edge to edge. */
  flush?: boolean;
  /** Section label for assistive technology when the plate has no title. */
  label?: string;
  /** An address inside the page (`#frontier`): a link to it scrolls here. */
  anchor?: string;
  children: ReactNode;
}

/** A solid plate on the grid ground (rule 5): every block of content sits in one. */
export function Plate({ title, actions, foot, variant, flush = false, label, anchor, children }: PlateProps) {
  const titleId = useId();
  return (
    <section
      id={anchor}
      className={cx('sy-plate', variant && `sy-plate--${variant}`)}
      aria-labelledby={title !== undefined ? titleId : undefined}
      aria-label={title === undefined ? label : undefined}
    >
      {(title !== undefined || actions !== undefined) && (
        <div className="sy-plate__head">
          {title !== undefined && (
            <h2 className="sy-plate__title" id={titleId}>
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {flush ? children : <div className="sy-plate__body">{children}</div>}
      {foot !== undefined && <div className="sy-plate__foot">{foot}</div>}
    </section>
  );
}
