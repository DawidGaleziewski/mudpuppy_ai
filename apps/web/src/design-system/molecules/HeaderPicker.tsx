import { useId, type ReactNode } from 'react';
import { cx } from '../cx.js';

export interface HeaderPickerProps {
  /** The one label over the group ("Portal", "As of"). */
  label: string;
  /** The portal picker with its store as the second half (designer T-11: `.sy-portal--store`). */
  joined?: boolean;
  /** The group's menus (`Menu` with `look="select"` / `"store"`). */
  children: ReactNode;
}

/** A labelled group of the header's pickers (`.sy-portal--compact`): Portal [portal ▾][store ▾], As of [Now ▾]. */
export function HeaderPicker({ label, joined = false, children }: HeaderPickerProps) {
  const id = useId();
  return (
    <div className={cx('sy-portal sy-portal--compact', joined && 'sy-portal--store')} role="group" aria-labelledby={id}>
      <span className="sy-label" id={id}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** The database mark beside a store's name (designer T-11). */
export function StoreMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true" focusable="false">
      <ellipse cx="6" cy="2.6" rx="4.5" ry="1.6" />
      <path d="M1.5 2.6v6.8c0 .9 2 1.6 4.5 1.6s4.5-.7 4.5-1.6V2.6M1.5 6c0 .9 2 1.6 4.5 1.6s4.5-.7 4.5-1.6" />
    </svg>
  );
}
