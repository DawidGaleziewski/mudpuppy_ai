import { createContext, useContext, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../cx.js';
import { Button } from '../atoms/Button.js';

interface DialogContextValue {
  close: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialog(part: string): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (ctx === null) throw new Error(`Dialog.${part} belongs inside a <Dialog>`);
  return ctx;
}

export interface DialogProps {
  /** Shown as a modal while true (the page or the owning component holds this state). */
  open: boolean;
  /** Escape or the × (`Dialog.Close`): the owner sets `open` to false. */
  onClose: () => void;
  /** The dialog's accessible name when it has no visible title to point at. */
  label?: string;
  /** The id of the visible title that names the dialog (`aria-labelledby`). */
  labelledBy?: string;
  /** `wide`: the picture dialog (D-45); `recording`: a recording with its facts column (Q10). */
  size?: 'wide' | 'recording' | 'browse' | 'full';
  onKeyDown?: (e: KeyboardEvent<HTMLDialogElement>) => void;
  children: ReactNode;
}

/**
 * A modal dialog (`.sy-dialog`) as a compound component: `Dialog.Head`, `Dialog.Body` or
 * `Dialog.Main` (with `Dialog.Figure` and `Dialog.Aside`), `Dialog.Foot`, and `Dialog.Close`. It
 * opens and closes with `open`; Escape and the × call `onClose`. Its parts render only while open.
 */
function DialogRoot({ open, onClose, label, labelledBy, size, onKeyDown, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={cx(
        'sy-dialog',
        size !== undefined && size !== 'full' && 'sy-dialog--wide',
        size === 'recording' && 'sy-dialog--recording',
        size === 'browse' && 'sy-dialog--browse',
        size === 'full' && 'sy-dialog--full',
      )}
      aria-label={labelledBy === undefined ? label : undefined}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
    >
      {open && <DialogContext.Provider value={{ close: onClose }}>{children}</DialogContext.Provider>}
    </dialog>
  );
}

/** The dialog's head: its title, and the switches and × on the right. */
function Head({ children }: { children: ReactNode }) {
  useDialog('Head');
  return <header className="sy-dialog__head">{children}</header>;
}

/** The dialog's text body (a confirm's question). */
function Body({ children }: { children: ReactNode }) {
  useDialog('Body');
  return <div className="sy-dialog__body">{children}</div>;
}

/** A picture beside a facts column (`Dialog.Figure` + `Dialog.Aside`); under 1024 px they stack. */
function Main({ children }: { children: ReactNode }) {
  useDialog('Main');
  return <div className="sy-dialog__main">{children}</div>;
}

/** The large picture; it scrolls a tall one, so it takes keyboard focus (axe scrollable-region-focusable). */
function Figure({ label, fit = 'width', children }: { label: string; fit?: 'width' | 'page'; children: ReactNode }) {
  useDialog('Figure');
  return (
    <figure className="sy-dialog__figure" data-fit={fit} tabIndex={0} aria-label={label}>
      {children}
    </figure>
  );
}

/** The facts column beside the picture. */
function Aside({ label, children }: { label: string; children: ReactNode }) {
  useDialog('Aside');
  return (
    <aside className="sy-dialog__aside" aria-label={label}>
      {children}
    </aside>
  );
}

/** The dialog's foot: its buttons, or the set's Previous / Next. */
function Foot({ children }: { children: ReactNode }) {
  useDialog('Foot');
  return <footer className="sy-dialog__foot">{children}</footer>;
}

/** The × in the head; Escape does the same. */
function Close() {
  const { close } = useDialog('Close');
  return (
    <Button size="md" className="sy-btn--icon sy-dialog__close" aria-label="Close (Esc)" onClick={close}>
      ×
    </Button>
  );
}

export const Dialog = Object.assign(DialogRoot, { Head, Body, Main, Figure, Aside, Foot, Close });
