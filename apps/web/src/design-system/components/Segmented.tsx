import type { ReactNode } from 'react';

export interface SegmentItem {
  value: string;
  label: ReactNode;
  /** A count beside the label ("Active 12"). */
  count?: number;
  /**
   * Unavailable here (designer Q9): it stays in place and in the tab order (`aria-disabled`, not
   * `disabled`, so a screen reader hears it and the reason), and pressing it does nothing.
   */
  disabled?: boolean;
  /** The id of the line that says why it is unavailable (always shown under the control). */
  reason?: string;
}

export interface SegmentedProps {
  items: readonly SegmentItem[];
  selected: string;
  onSelect: (value: string) => void;
  /** What the segments choose between, for assistive technology ("Status"). */
  label: string;
}

/**
 * A segmented control: one of a few values, every value visible (a status filter, Screenshot /
 * Wireframe). Toggle buttons with `aria-pressed`; for switching panels use `Tabs`. A segment that
 * does not apply here is shown disabled with its reason, never hidden, so nothing jumps.
 */
export function Segmented({ items, selected, onSelect, label }: SegmentedProps) {
  return (
    <div className="sy-seg" role="group" aria-label={label}>
      {items.map((s) => (
        <button
          key={s.value}
          type="button"
          aria-pressed={s.value === selected}
          aria-disabled={s.disabled || undefined}
          aria-describedby={s.disabled ? s.reason : undefined}
          onClick={() => {
            if (!s.disabled) onSelect(s.value);
          }}>
          {s.label}
          {/* plain, not a muted Count: muted grey fails contrast on the pressed (inverse) segment */}
          {s.count !== undefined && ` ${String(s.count)}`}
        </button>
      ))}
    </div>
  );
}
