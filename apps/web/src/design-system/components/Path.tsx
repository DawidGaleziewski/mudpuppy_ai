import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface PathStep {
  id: string;
  /** The step's route or name. */
  label: ReactNode;
  /** Selecting the step (a screen of the graph); a step without it is plain text. */
  onSelect?: () => void;
  /** The step the path ends on (where a scan stopped). */
  here?: boolean;
  /** What failed after the last step: drawn red, never selectable. */
  failed?: boolean;
}

/** A path of steps joined by arrows (a scan from its first screen to where it stopped). */
export function Path({ label, steps }: { label: string; steps: readonly PathStep[] }) {
  return (
    <ol className="sy-path" aria-label={label}>
      {steps.map((s) => {
        const className = cx('sy-path__step', s.here && 'sy-path__step--here', s.failed && 'sy-path__step--failed');
        return (
          <li key={s.id}>
            {s.onSelect && !s.failed ? (
              <button type="button" className={className} aria-current={s.here || undefined} onClick={s.onSelect}>
                {s.label}
              </button>
            ) : (
              <span className={className}>{s.label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
