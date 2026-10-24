// Add to process ▾ (designer T-05, D-69): the one menu on a card, the selection bar and the
// picture dialog. Last used first, then this persona's saved processes A–Z with their step count;
// one that already has every screen is shown "already in", disabled; then New process from these….
import type { MenuEntry } from '../design-system';
import type { Target } from './api-processes';

const LAST_KEY = 'mudpuppy.process.last-added';

/** The processes added to last in this browser (a per-viewer convenience; storage may be missing). */
function lastUsed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberAdded(id: string) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify([id, ...lastUsed().filter((x) => x !== id)].slice(0, 3)));
  } catch {
    // nothing to keep it in: the menu has no Last used group
  }
}

const plural = (n: number, w: string) => `${String(n)} ${w}${n === 1 ? '' : 's'}`;

/**
 * The menu's entries for `states` as `persona`: `add(target)` adds them, `fresh()` opens New
 * process from these. Processes of another persona are not listed (a guest screen in a
 * client-only process is a different question: Edit scope on the process).
 */
export function addEntries(targets: readonly Target[], persona: string, states: readonly string[], add: (t: Target) => void, fresh: () => void): MenuEntry[] {
  const mine = targets.filter((t) => t.persona === persona);
  const item = (t: Target, key: string): MenuEntry => {
    const all = states.length > 0 && states.every((s) => t.states.includes(s));
    return { key, label: t.name, note: `${t.persona} · ${plural(t.steps, 'step')}`, ...(all ? { aside: 'already in', disabled: true } : { onSelect: () => add(t) }) };
  };
  const last = lastUsed()
    .map((id) => mine.find((t) => t.id === id))
    .filter((t): t is Target => t !== undefined);
  return [
    ...(last.length > 0 ? [{ label: 'Last used', group: true as const }, ...last.map((t) => item(t, `last-${t.id}`))] : []),
    ...(mine.length > 0 ? [{ label: `Processes · ${persona}`, group: true as const }, ...mine.map((t) => item(t, t.id))] : []),
    { separator: true },
    { key: 'new', label: 'New process from these…', onSelect: fresh },
  ];
}
