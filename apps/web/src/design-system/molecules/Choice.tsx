import { useId, type ReactNode } from 'react';

/** A key on the keyboard, as the page's shortcuts name it (`1`, `W`, `Esc`). */
export function Kbd({ children }: { children: ReactNode }) {
  return <span className="sy-kbd">{children}</span>;
}

/** The page's single keys, under the form they work in: each key and what it does. */
export function KeyBar({ keys }: { keys: readonly (readonly [ReactNode, string])[] }) {
  return (
    <div className="sy-keybar" aria-label="Keyboard shortcuts">
      {keys.map(([k, what]) => (
        <span key={what}>
          {k} {what}
        </span>
      ))}
    </div>
  );
}

export interface ChoiceProps {
  /** The radio group's name: the choices of one question share it. */
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  /** The answer, in bold. */
  label: ReactNode;
  /** What choosing it does, one line; it also describes the radio for screen readers. */
  what: ReactNode;
  /** Its single key (`1`, `2`, `3`), shown and announced. */
  shortcut?: string;
  /** More under it: who chose it before, what the system says. */
  children?: ReactNode;
}

/**
 * One answer of a question as a large radio card (Same screen?: same screen, same with different
 * data, different screens). The whole card is the label; its key shows beside the answer.
 */
export function Choice({ name, value, checked, onChange, label, what, shortcut, children }: ChoiceProps) {
  const id = useId();
  return (
    <label className="sy-choice">
      <input
        className="sy-choice__input"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        aria-describedby={id}
        {...(shortcut ? { 'aria-keyshortcuts': shortcut } : {})}
      />
      <span className="sy-choice__body">
        <span className="sy-split">
          <b>{label}</b>
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </span>
        <span id={id}>{what}</span>
        {children}
      </span>
    </label>
  );
}
