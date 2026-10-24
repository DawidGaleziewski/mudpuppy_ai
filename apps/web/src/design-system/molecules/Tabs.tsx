import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Anchor } from '../atoms/Anchor.js';
import { Count } from '../atoms/Count.js';

export interface TabItem {
  id: string;
  label: ReactNode;
  /** A count beside the label (muted). */
  count?: number;
}

export interface TabsProps {
  items: readonly TabItem[];
  selected: string;
  onSelect: (id: string) => void;
  /** What the tabs switch between, for assistive technology. */
  label: string;
  /** The id prefix of the tab panels this list controls (`<prefix>-<tab id>`). */
  panelPrefix?: string;
}

/** Where each key moves from tab `i` of `n`. */
const KEY_MOVES: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_i, n) => n - 1,
};

/**
 * Tabs (WAI-ARIA tab pattern): arrow keys move along, Home and End jump, the selected tab is the
 * only one in the tab order. The caller renders the panel of the selected tab.
 */
export function Tabs({ items, selected, onSelect, label, panelPrefix }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent, i: number) => {
    const step = KEY_MOVES[e.key];
    if (step === undefined) return;
    const to = step(i, items.length);
    e.preventDefault();
    onSelect(items[to]!.id);
    refs.current[to]?.focus();
  };
  return (
    <div className="sy-tabs" role="tablist" aria-label={label}>
      {items.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          className="sy-tab"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === selected}
          aria-controls={panelPrefix ? `${panelPrefix}-${t.id}` : undefined}
          tabIndex={t.id === selected ? 0 : -1}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => move(e, i)}
        >
          {t.label}
          {t.count !== undefined && (
            <>
              {' '}
              <Count muted>{t.count}</Count>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

export interface ViewNavProps {
  /** What the views are views of ("Screens views"). */
  label: string;
  /** Each view's page; `current`: the page shown. */
  items: readonly { href: string; label: ReactNode; count?: number | undefined; current?: boolean }[];
}

/**
 * Views of one thing that are pages of their own (Screens: List, Map): links that look like tabs,
 * the current one marked for assistive technology. To switch panels inside a page use `Tabs`.
 */
export function ViewNav({ label, items }: ViewNavProps) {
  return (
    <nav className="sy-tabs" aria-label={label}>
      {items.map((v) => (
        <Anchor key={v.href} className="sy-tab" href={v.href} aria-current={v.current ? 'page' : undefined}>
          {v.label}
          {v.count !== undefined && (
            <>
              {' '}
              <Count muted>{v.count}</Count>
            </>
          )}
        </Anchor>
      ))}
    </nav>
  );
}

/** The panel of the selected tab: named by its tab, reachable by keyboard (`Tabs`' `panelPrefix`). */
export function TabPanel({ prefix, id, children }: { prefix: string; id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${prefix}-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0}>
      {children}
    </div>
  );
}
