/**
 * Deviations (spec 039 design § 8.1): every place where the new model version does not fit the
 * previous one. Pure: two model snapshots in, deviations out, each with a dedup key so a repeat
 * attaches to the first occurrence instead of opening a new one.
 */
import { compare } from '../model/clustering.js';

export type DeviationKind =
  | 'new_screen'
  | 'new_member'
  | 'new_action'
  | 'missing_action'
  | 'target_mismatch'
  | 'result_mismatch'
  | 'rule_mismatch';

export interface ModelSnapshot {
  /** Screen id → member state ids. */
  screens: ReadonlyMap<string, readonly string[]>;
  /** Action classes `screen\u0000elementKey\u0000kind` → coverage status. */
  classes: ReadonlyMap<string, string>;
  /** Model transitions as `screen\u0000elementKey\u0000kind\u0000toScreen\u0000result`. */
  transitions: ReadonlySet<string>;
}

export interface Deviation {
  kind: DeviationKind;
  /** Unique per portal and kind: `new_member:<screen>:<state>`. */
  subjectKey: string;
  screen: string;
  state?: string;
  elementKey?: string;
  actionKind?: string;
  /** For mismatches: the earlier target and result. */
  before?: { toScreen: string; result: string };
  after?: { toScreen: string; result: string };
}

const split = (k: string) => k.split('\u0000');

export function deviationsBetween(prev: ModelSnapshot, next: ModelSnapshot): Deviation[] {
  return [
    ...screenDeviations(prev, next),
    ...classDeviations(prev, next),
    ...transitionDeviations(prev, next),
  ];
}

/** New screens, and new members of known screens. */
function screenDeviations(prev: ModelSnapshot, next: ModelSnapshot): Deviation[] {
  const out: Deviation[] = [];
  for (const [screen, members] of [...next.screens].sort((a, b) => compare(a[0], b[0]))) {
    const before = prev.screens.get(screen);
    if (!before) {
      out.push({ kind: 'new_screen', subjectKey: `new_screen:${screen}`, screen });
      continue;
    }
    for (const m of [...members].sort(compare))
      if (!before.includes(m))
        out.push({ kind: 'new_member', subjectKey: `new_member:${screen}:${m}`, screen, state: m });
  }
  return out;
}

/** New actions on known screens, and actions gone missing. */
function classDeviations(prev: ModelSnapshot, next: ModelSnapshot): Deviation[] {
  const out: Deviation[] = [];
  // An element seen before under another kind is not new: a button first only seen (`click`) and
  // then pressed as a form's submit is one action (F-24@039).
  const prevElements = new Set(
    [...prev.classes.keys()].map((k) => split(k).slice(0, 2).join('\u0000')),
  );
  for (const [key, status] of [...next.classes].sort((a, b) => compare(a[0], b[0]))) {
    const [screen, elementKey, actionKind] = split(key) as [string, string, string];
    const was = prev.classes.get(key);
    const seenBefore = prevElements.has(`${screen}\u0000${elementKey}`);
    // A class on a brand-new screen is part of that screen's deviation, not one of its own.
    if (was === undefined && !seenBefore && prev.screens.has(screen))
      out.push({
        kind: 'new_action',
        subjectKey: `new_action:${key}`,
        screen,
        elementKey,
        actionKind,
      });
    if (status === 'not_seen_since' && was !== undefined && was !== 'not_seen_since')
      out.push({
        kind: 'missing_action',
        subjectKey: `missing_action:${key}`,
        screen,
        elementKey,
        actionKind,
      });
  }
  return out;
}

/** A known action that now leads elsewhere, or to another result. */
function transitionDeviations(prev: ModelSnapshot, next: ModelSnapshot): Deviation[] {
  const out: Deviation[] = [];
  const prevByAction = new Map<string, { toScreen: string; result: string }[]>();
  for (const t of prev.transitions) {
    const [s, e, k, to, r] = split(t) as [string, string, string, string, string];
    const a = `${s}\u0000${e}\u0000${k}`;
    prevByAction.set(a, [...(prevByAction.get(a) ?? []), { toScreen: to, result: r }]);
  }
  for (const t of [...next.transitions].sort(compare)) {
    if (prev.transitions.has(t)) continue;
    const [s, e, k, to, r] = split(t) as [string, string, string, string, string];
    const earlier = prevByAction.get(`${s}\u0000${e}\u0000${k}`);
    if (!earlier) continue; // a new action: reported above
    const sameTarget = earlier.find((x) => x.toScreen === to);
    if (sameTarget)
      out.push({
        kind: 'result_mismatch',
        subjectKey: `result_mismatch:${s}:${e}:${k}:${to}:${r}`,
        screen: s,
        elementKey: e,
        actionKind: k,
        before: sameTarget,
        after: { toScreen: to, result: r },
      });
    else
      out.push({
        kind: 'target_mismatch',
        subjectKey: `target_mismatch:${s}:${e}:${k}:${to}`,
        screen: s,
        elementKey: e,
        actionKind: k,
        before: earlier[0]!,
        after: { toScreen: to, result: r },
      });
  }
  return out;
}
