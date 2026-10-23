import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button.js';

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
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="sy-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {open && (
        <>
          <div className="sy-dialog__head">
            <h2 className="sy-plate__title" id={titleId}>
              {title}
            </h2>
          </div>
          <div className="sy-dialog__body">{children}</div>
          <div className="sy-dialog__foot">
            <Button variant="quiet" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="strong" busy={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
