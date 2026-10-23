import type { CSSProperties, ReactNode } from 'react';

/** Children one under the other, with the system's gap. */
export function Stack({ children }: { children: ReactNode }) {
  return <div className="sy-stack">{children}</div>;
}

/** Children in a row that wraps (buttons, tags, chips). */
export function Cluster({ children }: { children: ReactNode }) {
  return <div className="sy-cluster">{children}</div>;
}

/** Two ends of a line: the first child at the left, the last at the right. */
export function Split({ children }: { children: ReactNode }) {
  return <div className="sy-split">{children}</div>;
}

/** A grid of equal columns at least `min` wide (a token or a length, e.g. "18rem"). */
export function Grid({ children, min }: { children: ReactNode; min?: string }) {
  return (
    <div className="sy-grid" style={min ? ({ '--sy-min': min } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}

/** A main column and a side column (detail pages). */
export function Columns({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="sy-columns">
      <div className="sy-col-main">{main}</div>
      <div className="sy-col-side">{side}</div>
    </div>
  );
}
