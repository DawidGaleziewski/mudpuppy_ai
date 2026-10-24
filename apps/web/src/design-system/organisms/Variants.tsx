import type { CSSProperties, ReactNode } from 'react';

/**
 * A screen's variants as a list (D-46): every card one column wide however many there are, a lone
 * variant with its picture left and its facts right. Not a before / after pair: that is `Compare`.
 */
export function Variants({ children, min = '240px' }: { children: ReactNode; min?: string }) {
  // layout only: the column's minimum, as the designer's markup sets it
  return (
    <div className="sy-variants" style={{ '--sy-min': min } as CSSProperties}>
      {children}
    </div>
  );
}

export interface VariantProps {
  /** The heading's id, unique on the page. */
  id: string;
  /** The variant's name ("r1"). */
  label: ReactNode;
  /** Beside the name: why it differs (a chip). */
  aside?: ReactNode;
  /** The picture (`Picture`). */
  picture: ReactNode;
  /** The facts, the status and its explanation, then the actions, in that order. */
  children: ReactNode;
}

/** One card of `Variants`: head (name and why), picture, then the facts. */
export function Variant({ id, label, aside, picture, children }: VariantProps) {
  const head = `${id}-h`;
  return (
    <section className="sy-variant" aria-labelledby={head}>
      <header className="sy-variant__head">
        <h3 id={head} className="sy-h3">
          {label}
        </h3>
        {aside}
      </header>
      <div className="sy-variant__pic">{picture}</div>
      <div className="sy-variant__body">{children}</div>
    </section>
  );
}
