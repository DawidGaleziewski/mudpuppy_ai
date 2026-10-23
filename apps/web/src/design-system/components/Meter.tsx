import type { CSSProperties, ReactNode } from 'react';
import type { StatusKind } from '../status.js';

export interface MeterProps {
  /** What is measured, at the left of the label ("Scan 01a110d5"). */
  label: ReactNode;
  value: number;
  max: number;
  /** The count at the right ("171 / 400 steps"); `value / max` when left out. */
  detail?: ReactNode;
  status?: StatusKind;
}

/** A progress meter with its numbers: counts first (voice). */
export function Meter({ label, value, max, detail, status = 'running' }: MeterProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="sy-meter"
      data-status={status}
      style={{ '--value': `${pct.toFixed(2)}%` } as CSSProperties}
    >
      <div className="sy-meter__label">
        <span>{label}</span>
        <span>{detail ?? `${String(value)} / ${String(max)}`}</span>
      </div>
      <div
        className="sy-meter__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div className="sy-meter__fill" />
      </div>
    </div>
  );
}
