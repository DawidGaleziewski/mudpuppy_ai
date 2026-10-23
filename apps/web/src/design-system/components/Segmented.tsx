import type { ReactNode } from 'react';

export interface SegmentItem {
  value: string;
  label: ReactNode;
  /** A count beside the label ("Active 12"). */
  count?: number;
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
 * Wireframe). Toggle buttons with `aria-pressed`; for switching panels use `Tabs`.
 */
export function Segmented({ items, selected, onSelect, label }: SegmentedProps) {
  return (
    <div className="sy-seg" role="group" aria-label={label}>
      {items.map((s) => (
        <button key={s.value} type="button" aria-pressed={s.value === selected} onClick={() => onSelect(s.value)}>
          {s.label}
          {/* plain, not a muted Count: muted grey fails contrast on the pressed (inverse) segment */}
          {s.count !== undefined && ` ${String(s.count)}`}
        </button>
      ))}
    </div>
  );
}
