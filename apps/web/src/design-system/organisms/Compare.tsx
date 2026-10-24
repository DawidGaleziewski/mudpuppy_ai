import { useId, useState, type CSSProperties, type ReactNode } from 'react';

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

export interface CompareOverlayProps {
  /** The stack's name, in its head ("Before, with After over it"). */
  title: ReactNode;
  /** At the right of the head: a chip saying what is drawn over what. */
  aside?: ReactNode;
  /** The before: a `Shot` with `layer="under"` (it carries the accessible name of both). */
  under: ReactNode;
  /** The after: a `Shot` with `layer="over"`; its picture follows the mix, its marks stay full strength. */
  over: ReactNode;
  /** Shown under the stack, e.g. how to read the double edges. */
  children?: ReactNode;
}

/**
 * Overlay (designer Q5b, `.sy-compare--overlay`): the after's picture over the before's at a mix
 * the slider sets (default 50 %, ← / → by 5 %, Home / End for 0 / 100 %), for small shifts.
 */
export function CompareOverlay({ title, aside, under, over, children }: CompareOverlayProps) {
  const id = useId();
  const [mix, setMix] = useState(50);
  const stack = { '--sy-overlay': String(mix / 100) } as CSSProperties;
  return (
    <div className="sy-compare sy-compare--overlay">
      <section className="sy-compare__side" aria-labelledby={id}>
        <header className="sy-compare__head">
          <h3 className="sy-h3" id={id}>
            {title}
          </h3>
          {aside}
        </header>
        <div className="sy-compare__stack" style={stack}>
          {under}
          {over}
        </div>
        <label className="sy-compare__mix">
          <span>Before</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={mix}
            aria-label="How strongly the after shows"
            aria-valuetext={`After at ${String(mix)}%`}
            onChange={(e) => setMix(Number(e.target.value))}
          />
          <span>After</span>
          <output>{`${String(mix)}%`}</output>
        </label>
        {children}
      </section>
    </div>
  );
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
