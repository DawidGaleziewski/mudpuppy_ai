import { useId, type CSSProperties, type ReactNode } from 'react';

/**
 * Things side by side to compare: before / after, a screen's variants. Wraps on a narrow screen;
 * each side is at least `min` wide (a length, default 320px; a screen's variants use 220px).
 */
export function Compare({ children, min }: { children: ReactNode; min?: string }) {
  return (
    <div className="sy-compare" style={min ? ({ '--sy-min': min } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}

export interface CompareSideProps {
  /** The side's name, in its head ("Before · 5f08", "r2"). */
  title: ReactNode;
  /** At the right of the head: a chip saying why it differs. */
  aside?: ReactNode;
  children: ReactNode;
}

/** One side of a `Compare`: a section named by its head. */
export function CompareSide({ title, aside, children }: CompareSideProps) {
  const id = useId();
  return (
    <section className="sy-compare__side" aria-labelledby={id}>
      <header className="sy-compare__head">
        <h3 className="sy-h3" id={id}>
          {title}
        </h3>
        {aside}
      </header>
      {children}
    </section>
  );
}
