import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Menu, type MenuEntry } from '../molecules/Menu.js';

/** One screen card of the sorting grid. */
export interface PickItem {
  key: string;
  title: string;
  route: string;
  /** "seen 17 Oct · 2 variants". */
  meta?: string;
  /** Its picture; none: the hatched "no picture" box. */
  src?: string | null;
  ticked: boolean;
  /** Its place in tick order (the step it gets in a new process). */
  step?: number | null;
}

export interface SortGridProps {
  /** What the grid is ("Screens in no process"). */
  label: string;
  items: readonly PickItem[];
  /** A tick or untick; `range` with Shift + click (every card from the last one ticked). */
  onTick: (key: string, range: boolean) => void;
  /** The picture opens the dialog browsing the grid (designer T-04). */
  onOpen: (key: string) => void;
  /** Add to process ▾ on a card. */
  menuFor?: (key: string) => readonly MenuEntry[];
  /** Under the grid, while something is ticked: the selection bar. */
  children?: ReactNode;
}

function Card({ item, onTick, onOpen, menuFor }: { item: PickItem } & Omit<SortGridProps, 'label' | 'items' | 'children'>) {
  const keys = (e: KeyboardEvent<HTMLLIElement>) => {
    if ((e.key === 'x' || e.key === 'X') && !(e.target instanceof HTMLInputElement && e.target.type !== 'checkbox')) {
      e.preventDefault();
      onTick(item.key, false);
    }
  };
  const click = (e: MouseEvent<HTMLInputElement>) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    onTick(item.key, true);
  };
  return (
    <li className="sy-pick" data-ticked={item.ticked ? '' : undefined} onKeyDown={keys} aria-keyshortcuts="X">
      {item.ticked && item.step != null && (
        <span className="sy-pick__step" aria-hidden="true">
          {item.step}
        </span>
      )}
      <label className="sy-pick__tick">
        <input type="checkbox" checked={item.ticked} onChange={() => onTick(item.key, false)} onClick={click} />
        <span className="sy-case-normal">{item.title}</span>
      </label>
      {item.src ? (
        <button type="button" className="sy-thumb-btn" aria-haspopup="dialog" onClick={() => onOpen(item.key)} data-pick={item.key}>
          <img className="sy-thumb" src={item.src} width={192} height={120} loading="lazy" decoding="async" alt={item.title} />
          <span className="sy-sr-only">, enlarge</span>
        </button>
      ) : (
        <span className="sy-thumb sy-thumb--none" aria-hidden="true">
          no picture
        </span>
      )}
      <span className="sy-pick__route">{item.route}</span>
      {item.meta && <span className="sy-pick__meta">{`${item.meta}${item.ticked && item.step != null ? ` · step ${String(item.step)} of the new process` : ''}`}</span>}
      {menuFor && <Menu label="Add to process" button="Add to process ▾" entries={menuFor(item.key)} searchAfter={8} searchLabel="Find a process" />}
    </li>
  );
}

/**
 * The sorting grid of loose screens (designer T-05, D-69): tickable picture cards (≥ 200 px), a
 * ticked card with a chalk edge and its step number in tick order; X ticks a focused card, Shift
 * + click ticks a range; the picture opens the dialog browsing the grid; Add to process ▾ on a
 * card. Dragging stays out: the menu does the same job for everyone.
 */
export function SortGrid({ label, items, children, ...card }: SortGridProps) {
  return (
    <>
      <ul className="sy-sortgrid" aria-label={label}>
        {items.map((it) => (
          <Card key={it.key} item={it} {...card} />
        ))}
      </ul>
      {children}
    </>
  );
}

/** The selection bar (`.sy-selbar`): sticky at the bottom while anything is ticked. */
export function SelectionBar({ count, children }: { count: string; children: ReactNode }) {
  return (
    <div className="sy-selbar" role="region" aria-label="Selection">
      <span className="sy-selbar__count">{count}</span>
      {children}
    </div>
  );
}
