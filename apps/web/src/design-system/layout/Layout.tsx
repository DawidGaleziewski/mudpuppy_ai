import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../cx.js';
import { utilityClasses, type Space } from './Box.js';

/** Spacing a layout component takes: its gap and the margins around it, on the token scale. */
interface Spaced {
  /** The gap between children instead of the system's default for this layout. */
  gap?: Space;
  mt?: Space;
  mb?: Space;
}

const spaced = ({ gap, mt, mb }: Spaced) =>
  utilityClasses({ ...(gap === undefined ? {} : { gap }), ...(mt === undefined ? {} : { mt }), ...(mb === undefined ? {} : { mb }) });

/** Children one under the other, with the system's gap (or `gap`). */
export function Stack({ children, ...space }: Spaced & { children: ReactNode }) {
  return <div className={cx('sy-stack', spaced(space))}>{children}</div>;
}

/** Children in a row that wraps (buttons, tags, chips). */
export function Cluster({ children, ...space }: Spaced & { children: ReactNode }) {
  return <div className={cx('sy-cluster', spaced(space))}>{children}</div>;
}

/** Two ends of a line: the first child at the left, the last at the right. */
export function Split({ children, ...space }: Spaced & { children: ReactNode }) {
  return <div className={cx('sy-split', spaced(space))}>{children}</div>;
}

/** A grid of equal columns at least `min` wide (a token or a length, e.g. "18rem"). */
export function Grid({ children, min, ...space }: Spaced & { children: ReactNode; min?: string }) {
  return (
    <div className={cx('sy-grid', spaced(space))} style={min ? ({ '--sy-min': min } as CSSProperties) : undefined}>
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
