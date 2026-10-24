import type { CSSProperties, ReactNode } from 'react';
import { Loader } from '../molecules/Loader.js';

export interface SkeletonProps {
  /** What is loading ("Loading screens"): the loader at the top says it. */
  label: string;
  /** The page's shape at its final size: `Skeleton.Rows`, `Skeleton.Block`, `Skeleton.Line`. */
  children?: ReactNode;
}

const vars = (v: Record<string, string>) => v as CSSProperties;

/**
 * A page body while it loads (designer T-10, D-75): neutral steel, not blueprint (blueprint is the
 * assistant drawing), drawn from what the page will have, at its final size, so the data lands in
 * the same boxes. The loader on top names what loads. Shown only after 300 ms (`QueryState`).
 */
function SkeletonRoot({ label, children = <Rows /> }: SkeletonProps) {
  return (
    <div className="sy-skel" aria-busy="true">
      <Loader>{label}</Loader>
      {children}
    </div>
  );
}

/** A table: its head row and `rows` rows of the final row height (49 px; 61 px with 72 px pictures). */
function Rows({ rows = 8, rowHeight = 49 }: { rows?: number; rowHeight?: number }) {
  return <div className="sy-skel__rows" style={vars({ '--sy-skel-rows': String(Math.min(rows, 10)), '--sy-skel-row': `${String(rowHeight)}px` })} />;
}

/** A plate or a picture box of its final height. */
function Block({ height = 80 }: { height?: number }) {
  return <div className="sy-skel__block" style={vars({ '--sy-skel-h': `${String(height)}px` })} />;
}

/** A line of text not here yet, `width` of the column (a data line in a head: "60%"). */
function Line({ width = '60%' }: { width?: string }) {
  return <div className="sy-skel__line" style={vars({ '--sy-skel-w': width })} />;
}

export const Skeleton = Object.assign(SkeletonRoot, { Rows, Block, Line });
