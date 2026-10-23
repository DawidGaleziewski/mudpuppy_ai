// Review's single keys (designer § 5.2, spec 063): J / K next and previous item, C confirm, R
// reject (to the reason), U undo the last decision, ? the list of keys; Before / after (spec 064)
// also Esc back to What changed. Never while typing, with
// a modifier, or while a dialog is open. The controls they reach carry `data-review-key`; a
// person can turn the keys off in this browser (a per-viewer convenience: storage may be missing).
import { useEffect, useState } from 'react';

const OFF_KEY = 'mudpuppy.review.keys';

function storedOn(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) !== 'off';
  } catch {
    return true;
  }
}

function keep(on: boolean) {
  try {
    if (on) localStorage.removeItem(OFF_KEY);
    else localStorage.setItem(OFF_KEY, 'off');
  } catch {
    // nothing to keep it in: the choice lasts while the page is open
  }
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** The control marked for `key` in the page, if any. */
const marked = (key: string) => document.querySelector<HTMLElement>(`[data-review-key="${key}"]:not([disabled])`);

export interface ReviewKeys {
  /** Go to the next (`1`) or previous (`-1`) item of the group. */
  move: (step: 1 | -1) => void;
  /** Show the list of keys (Review). */
  help?: () => void;
  /** Esc: back to the list (Before / after, spec 064). */
  back?: () => void;
}

const none = () => undefined;

export function useReviewKeys({ move, help = none, back }: ReviewKeys) {
  const [on, setOn] = useState(storedOn);
  useEffect(() => {
    if (!on) return;
    const press = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return;
      const acts: Record<string, () => void> = {
        j: () => move(1),
        k: () => move(-1),
        c: () => marked('c')?.click(),
        r: () => marked('r')?.focus(),
        u: () => marked('u')?.click(),
        '?': help,
        ...(back ? { escape: back } : {}),
      };
      const act = acts[e.key.toLowerCase()];
      if (!act) return;
      e.preventDefault();
      act();
    };
    document.addEventListener('keydown', press);
    return () => document.removeEventListener('keydown', press);
  }, [on, move, help, back]);
  const turn = (next: boolean) => {
    setOn(next);
    keep(next);
  };
  return { on, turn };
}
