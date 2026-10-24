import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Anchor } from '../atoms/Anchor.js';
import { cx } from '../cx.js';

export interface MenuItemSpec {
  /** A stable key (a store's key, a process's key). */
  key: string;
  label: ReactNode;
  /** A muted line under the label ("guest · 2 steps"). */
  note?: ReactNode;
  /** Beside the label, at the end ("already in", a chip). */
  aside?: ReactNode;
  /** A link item (moves); otherwise `onSelect` runs. */
  href?: string;
  onSelect?: () => void;
  /** A radio item: the current choice of a set (a store). */
  checked?: boolean;
  /** Shown and focusable, but pressing it does nothing (`aria-disabled`, designer Q9). */
  disabled?: boolean;
}

/** A group label, a separator or an item, in the menu's order. */
export type MenuEntry = MenuItemSpec | { label: string; group: true } | { separator: true };

export interface MenuProps {
  /** What the button shows. */
  button: ReactNode;
  /** The menu's name for assistive technology ("Data store", "Add to process"). */
  label: string;
  entries: readonly MenuEntry[];
  /** The button's accessible name when its text is short ("Data store: sandbox, read-only"). */
  buttonLabel?: string;
  /** The button's hover text. */
  title?: string;
  /** The button's look: a button (`btn`, `btn-sm`) or the header's picker half (`select`, `store`). */
  look?: 'btn' | 'btn-sm' | 'select' | 'store';
  /** Unavailable (`aria-disabled`); the menu doesn't open. */
  disabled?: boolean;
  /** Opens to the left from the button's end (a button near the right edge), or upwards (a bar at the bottom). */
  align?: 'start' | 'end' | 'up';
  /** A filter field at the top past this many items ("Find a process"). */
  searchAfter?: number;
  searchLabel?: string;
  /** Open from outside (a key such as A in the picture dialog); the menu tells back with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const isItem = (e: MenuEntry): e is MenuItemSpec => 'key' in e;

const LOOKS = {
  btn: 'sy-btn',
  'btn-sm': 'sy-btn sy-btn--sm',
  select: 'sy-select',
  store: 'sy-select sy-store',
} as const;

function textOf(node: ReactNode): string {
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

/** Esc closes (focus back on the button); ↑ / ↓ move between the items. */
function menuKeys(e: KeyboardEvent<HTMLDivElement>, box: HTMLElement | null, close: (focus: boolean) => void) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    close(true);
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const all = [...(box?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
  const at = all.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'ArrowDown' ? Math.min(all.length - 1, at + 1) : Math.max(0, at - 1);
  all[next]?.focus();
}

/** The menu's open state: from outside when given, else its own; Esc and a click outside close it. */
function useOpen(given: boolean | undefined, tell: ((open: boolean) => void) | undefined) {
  const [own, setOwn] = useState(false);
  const open = given ?? own;
  const set = useCallback(
    (next: boolean) => {
      setOwn(next);
      tell?.(next);
    },
    [tell],
  );
  return [open, set] as const;
}

/**
 * A menu button and its popup (`.sy-menu`, designer T-05, T-11): actions or choices that don't
 * fit on the page (Add to process, the data store). ↑ / ↓ move, typing in the filter narrows,
 * Enter picks, Esc closes and returns focus to the button. It never moves the page: the popup is
 * out of the flow.
 */
export function Menu({
  button,
  label,
  entries,
  buttonLabel,
  title,
  look = 'btn-sm',
  disabled = false,
  align = 'start',
  searchAfter,
  searchLabel = 'Find',
  open: given,
  onOpenChange,
}: MenuProps) {
  const id = useId();
  const [open, setOpen] = useOpen(given, onOpenChange);
  const [query, setQuery] = useState('');
  const box = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = entries.filter(isItem);
  const searching = searchAfter !== undefined && items.length > searchAfter;
  const shown = searching && query ? entries.filter((e) => !isItem(e) || textOf(e.label).toLowerCase().includes(query.toLowerCase())) : entries;
  const close = useCallback(
    (focus: boolean) => {
      setOpen(false);
      setQuery('');
      if (focus) trigger.current?.focus();
    },
    [setOpen],
  );
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', away);
    // the first item (or the filter) takes focus, so the keys work at once
    box.current?.querySelector<HTMLElement>('.sy-menu input, .sy-menu [role^="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', away);
  }, [open, close]);
  const keys = (e: KeyboardEvent<HTMLDivElement>) => menuKeys(e, box.current, close);
  const pick = (item: MenuItemSpec) => {
    if (item.disabled) return;
    item.onSelect?.();
    close(true);
  };
  return (
    <span ref={box} className={cx('sy-menubox', align === 'end' && 'sy-menubox--end', align === 'up' && 'sy-menubox--up')}>
      <button
        ref={trigger}
        type="button"
        className={LOOKS[look]}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={buttonLabel}
        aria-disabled={disabled || undefined}
        title={title}
        onClick={() => {
          if (!disabled) setOpen(!open);
        }}>
        {button}
      </button>
      {open && (
        <div className="sy-menu" role="menu" id={id} aria-label={label} onKeyDown={keys}>
          {searching && (
            <label className="sy-menu__search">
              <span className="sy-sr-only">{searchLabel}</span>
              <input className="sy-input" type="search" placeholder={searchLabel} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          )}
          {shown.map((e, i) => (
            <Entry key={isItem(e) ? e.key : `x${String(i)}`} entry={e} pick={pick} />
          ))}
        </div>
      )}
    </span>
  );
}

function Entry({ entry, pick }: { entry: MenuEntry; pick: (item: MenuItemSpec) => void }) {
  if ('separator' in entry) return <span className="sy-menu__sep" role="separator" />;
  if ('group' in entry)
    return (
      <span className="sy-menu__label" aria-hidden="true">
        {entry.label}
      </span>
    );
  const role = entry.checked === undefined ? 'menuitem' : 'menuitemradio';
  const body = (
    <>
      <span>{entry.label}</span>
      {entry.aside !== undefined && <span className="sy-small">{entry.aside}</span>}
      {entry.note !== undefined && <small>{entry.note}</small>}
    </>
  );
  if (entry.href !== undefined && !entry.disabled)
    return (
      // a menu's link is chrome, like the nav: it starts a fresh trail (data-fresh, designer T-01)
      <Anchor className="sy-menu__item" role={role} aria-checked={entry.checked} href={entry.href} onClick={() => pick(entry)} data-fresh="">
        {body}
      </Anchor>
    );
  return (
    <button
      type="button"
      className="sy-menu__item"
      role={role}
      aria-checked={entry.checked}
      aria-disabled={entry.disabled || undefined}
      onClick={() => pick(entry)}>
      {body}
    </button>
  );
}
