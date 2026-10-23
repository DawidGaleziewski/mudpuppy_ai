import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { cx } from '../cx.js';

// Layout only: a log outside the drawer (the Workbench) scrolls inside its box too. The drawer's
// own height, stickiness and log scrolling are the designer's CSS (Q8, `.sy-drawer`).
const LOG: CSSProperties = { minHeight: 0, overflowY: 'auto' };
// How near the end still counts as "at the newest message".
const NEAR_END = 24;

export interface DrawerProps {
  /** The drawer's name ("Assistant"). */
  title: string;
  /** Its head's buttons: open full page, close. */
  actions?: ReactNode;
  /** What the assistant can see (This page / Whole yard and what is in context). */
  context?: ReactNode;
  /** Esc closes it (when no dialog is open over it). */
  onClose?: () => void;
  children: ReactNode;
}

/**
 * The assistant drawer beside the main column (screen 02, `.sy-drawer`): a titled head with its
 * actions, the context it sees, then the conversation. A narrow screen stacks it under the page.
 */
export function Drawer({ title, actions, context, onClose, children }: DrawerProps) {
  const id = useId();
  useEffect(() => {
    if (!onClose) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <aside className="sy-drawer" aria-labelledby={id}>
      <div className="sy-drawer__head">
        <h2 className="sy-plate__title" id={id}>
          {title}
        </h2>
        {actions}
      </div>
      {context !== undefined && <div className="sy-drawer__context">{context}</div>}
      {children}
    </aside>
  );
}

/**
 * A conversation's messages (`.sy-chat__log`, a `log` region): it opens at the newest message and
 * stays there as messages arrive (`follow` changes), unless the person scrolled up; then a
 * "New messages ↓" button takes them down (designer Q8).
 */
export function ChatLog({ children, label = 'Messages', follow }: { children: ReactNode; label?: string; follow?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const toEnd = () => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    atEnd.current = true;
    setUnseen(false);
  };
  useEffect(() => {
    if (atEnd.current) toEnd();
    else setUnseen(true);
  }, [follow]);
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_END;
    if (atEnd.current) setUnseen(false);
  };
  return (
    <>
      <div ref={ref} className="sy-chat__log" role="log" aria-label={label} tabIndex={0} style={LOG} onScroll={onScroll}>
        {children}
      </div>
      {unseen && (
        <button className="sy-btn sy-btn--sm" type="button" onClick={toEnd}>
          New messages ↓
        </button>
      )}
    </>
  );
}

export interface MessageProps {
  /** Who speaks, above the text ("Assistant"); none for the person's own message. */
  who?: string;
  /** The person's own message: to the right, raised. */
  mine?: boolean;
  children: ReactNode;
}

/** One message of the conversation (`.sy-msg`). Text is shown exactly as written. */
export function Message({ who, mine = false, children }: MessageProps) {
  return (
    <div className={cx('sy-msg', mine && 'sy-msg--user')}>
      {who !== undefined && <span className="sy-msg__who">{who}</span>}
      {children}
    </div>
  );
}

/** A system line between messages ("Scan finished · 10:42Z"): small caps rule across. */
export function ChatDivider({ children }: { children: ReactNode }) {
  return <div className="sy-chat__divider">{children}</div>;
}

/** The message box under a conversation (`.sy-composer`): its field, hint and buttons. */
export function Composer({ children, onSubmit, label = 'Write to the assistant' }: { children: ReactNode; onSubmit: () => void; label?: string }) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className="sy-composer" aria-label={label} onSubmit={submit}>
      {children}
    </form>
  );
}

/** A vault field the assistant asked for (`.sy-vault`): a credential's name and where it goes; never its value. */
export function Vault({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="sy-vault" aria-label={label}>
      {children}
    </section>
  );
}

export interface ProposalCardProps {
  /** "Proposed change", "Applied as r3". */
  title: string;
  /** At the right of the head: the amendment's tag, the status. */
  aside?: ReactNode;
  /** Applied: a solid green frame instead of the to-be dashes. */
  applied?: boolean;
  children: ReactNode;
  foot?: ReactNode;
}

/** A change the assistant drafted (`.sy-proposal`): to-be (dashed) until a person applies it. */
export function ProposalCard({ title, aside, applied = false, children, foot }: ProposalCardProps) {
  return (
    <div className={cx('sy-proposal', applied && 'sy-proposal--applied')}>
      <div className="sy-proposal__head">
        <span className="sy-proposal__title">{title}</span>
        {aside}
      </div>
      <div className="sy-proposal__body">{children}</div>
      {foot !== undefined && <div className="sy-proposal__foot">{foot}</div>}
    </div>
  );
}

/** Small buttons in a row that wraps (`.sy-chips`): the assistant's suggestions. */
export function Chips({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="sy-chips" role="group" aria-label={label}>
      {children}
    </div>
  );
}
