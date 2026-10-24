import type { ReactNode } from 'react';
import type { StatusKind } from '../status.js';
import { Status } from '../atoms/Status.js';

export interface Step {
  label: ReactNode;
  status: StatusKind;
  /** The status word ("21", "Needs you"); the status's own word when left out. */
  word?: ReactNode;
  /** The step the person is on now. */
  current?: boolean;
}

/** A workflow's steps in order, each with its status (the guided chat's tracker). */
export function Steps({ steps, label }: { steps: readonly Step[]; label: string }) {
  return (
    <ol className="sy-steps" aria-label={label}>
      {steps.map((s, i) => (
        <li
          key={i}
          aria-current={s.current ? 'step' : undefined}
          data-state={s.status === 'todo' ? 'todo' : undefined}
        >
          <span>{s.label}</span>
          <Status status={s.status}>{s.word}</Status>
        </li>
      ))}
    </ol>
  );
}
