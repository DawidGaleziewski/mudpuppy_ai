// The zoom bar of a canvas (the map's Graph, a Diagram; designer answers Q4, T-07, T-08): −, the
// level (the actual value; pressing it resets to 100 %), +, Fit, and Full screen at its end.
import { OVERVIEW, pct, stepIn, stepOut } from './canvas.js';

export interface ZoomBarProps {
  /** The id of the canvas it zooms. */
  controls: string;
  /** "Zoom the map", "Zoom the diagram". */
  label?: string;
  scale: number;
  fitted: boolean;
  zoom: (s: number) => void;
  fit: () => void;
  /** Opens the canvas full screen (T-08); none: no button (already full screen). */
  full?: () => void;
  /** The canvas isn't drawn yet: shown, but nothing to zoom (FE-V45). */
  disabled?: boolean;
}

/** The floating, sticky zoom bar (`.sy-graph__zoom`). */
export function ZoomBar({ controls, label = 'Zoom the map', scale, fitted, zoom, fit, full, disabled = false }: ZoomBarProps) {
  const quiet = 'sy-btn sy-btn--sm sy-btn--quiet';
  const off = disabled || undefined;
  return (
    <div className="sy-graph__zoom" role="toolbar" aria-label={label} aria-controls={controls}>
      <button className={quiet} type="button" aria-label="Zoom out" aria-disabled={off} onClick={() => !disabled && zoom(stepOut(scale))}>
        −
      </button>
      <button
        className={`${quiet} sy-graph__zoom-level`}
        type="button"
        aria-label={`Zoom ${pct(scale)}${scale < OVERVIEW ? ', overview' : ''}, reset to 100%`}
        aria-disabled={off}
        onClick={() => !disabled && zoom(1)}>
        {pct(scale)}
      </button>
      <button className={quiet} type="button" aria-label="Zoom in" aria-disabled={off} onClick={() => !disabled && zoom(stepIn(scale))}>
        +
      </button>
      <button className={quiet} type="button" aria-pressed={fitted} aria-disabled={off} onClick={() => !disabled && fit()}>
        Fit
      </button>
      {full && (
        <button className={`${quiet} sy-btn--icon`} type="button" aria-label="Full screen" title="Full screen (F)" aria-disabled={off} onClick={() => !disabled && full()}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
            <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
          </svg>
        </button>
      )}
    </div>
  );
}
