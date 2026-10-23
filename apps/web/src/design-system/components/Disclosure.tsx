import type { ReactNode } from 'react';

export interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
  /** Told when the person opens or closes it (load the body's data on the first open). */
  onToggle?: (open: boolean) => void;
}

/** A summary that opens a body (`details`): a JSON shape, a long detail kept out of the way. */
export function Disclosure({ summary, children, open = false, onToggle }: DisclosureProps) {
  return (
    <details
      className="sy-disclosure"
      open={open}
      onToggle={onToggle ? (e) => onToggle(e.currentTarget.open) : undefined}
    >
      <summary>{summary}</summary>
      <div className="sy-disclosure__body">{children}</div>
    </details>
  );
}
