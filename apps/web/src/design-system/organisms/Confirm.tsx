import { useId, type ReactNode } from 'react';
import { Button } from '../atoms/Button.js';
import { Dialog } from './Dialog.js';

export interface ConfirmProps {
  /** Shown as a modal dialog while true. */
  open: boolean;
  /** The question, as the dialog's heading ("Mark Start here?"). */
  title: ReactNode;
  /** What will happen when the person confirms: the target and the effect, in one or two lines. */
  children: ReactNode;
  /** The confirming button's word: the action itself ("Mark", "Skip it"), never "OK". */
  confirmLabel: string;
  onConfirm: () => void;
  /** Cancel, Escape or the dialog closing some other way. */
  onCancel: () => void;
  /** The write is on its way: the confirming button shows it and refuses clicks. */
  busy?: boolean;
}

/**
 * The confirm before a write (skill rule 8): a modal dialog that says what will happen, with
 * Cancel and one confirming button (`strong`, never a second primary on the view). Escape cancels.
 */
export function Confirm({ open, title, children, confirmLabel, onConfirm, onCancel, busy = false }: ConfirmProps) {
  const titleId = useId();
  return (
    <Dialog open={open} onClose={onCancel} labelledBy={titleId}>
      <Dialog.Head>
        <h2 className="sy-plate__title" id={titleId}>
          {title}
        </h2>
      </Dialog.Head>
      <Dialog.Body>{children}</Dialog.Body>
      <Dialog.Foot>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="strong" busy={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Dialog.Foot>
    </Dialog>
  );
}
