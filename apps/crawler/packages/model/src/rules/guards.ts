/**
 * Guard intersection along process paths (spec 039 design § 11.6, T064): after mining, the rules
 * that lead from one decision point to the next are chained screen by screen, and their
 * conditions are intersected per attribute. A path whose guards cannot all hold (the first step
 * needs `age >= 18`, a later one `age < 16`) is an `ambiguous` hypothesis for a person: one of
 * the rules is wrong, or the attribute changes on the way. Pure.
 */
import { MODEL_DEFAULTS } from '../defaults.js';
import type { Condition, DecisionTable } from './boundary.js';

/** A numeric interval; `loIn` / `hiIn`: the bound itself is allowed. */
interface Interval {
  kind: 'num';
  lo: number;
  loIn: boolean;
  hi: number;
  hiIn: boolean;
}

/** What one attribute may still be: a numeric interval or a set of values. */
type Domain = Interval | { kind: 'set'; values: ReadonlySet<string> };

const NUMERIC = /^(<=|>=|<|>|=)\s*(-?\d+(?:\.\d+)?)$/;
const ANY: Interval = { kind: 'num', lo: -Infinity, loIn: false, hi: Infinity, hiIn: false };

/** The domain of a condition; null for a condition this module cannot read (it never conflicts). */
export function domainOf(c: Condition): Domain | null {
  const s = c.trim();
  const m = NUMERIC.exec(s);
  if (m) {
    const t = Number(m[2]);
    const by: Record<string, Domain> = {
      '<': { ...ANY, hi: t, hiIn: false },
      '<=': { ...ANY, hi: t, hiIn: true },
      '>': { ...ANY, lo: t, loIn: false },
      '>=': { ...ANY, lo: t, loIn: true },
      '=': { kind: 'num', lo: t, loIn: true, hi: t, hiIn: true },
    };
    return by[m[1]!]!;
  }
  const eq = /^=\s*(.+)$/.exec(s);
  if (eq) return { kind: 'set', values: new Set([eq[1]!.trim()]) };
  const list = /^in\s*\[(.*)\]$/.exec(s);
  if (list) return { kind: 'set', values: new Set(list[1]!.split(',').map((v) => v.trim())) };
  return null;
}

/** Both domains at once; null when they mix kinds (a value seen as text and as a number). */
function intersect(a: Domain, b: Domain): Domain | null {
  if (a.kind === 'set' && b.kind === 'set')
    return { kind: 'set', values: new Set([...a.values].filter((v) => b.values.has(v))) };
  if (a.kind === 'num' && b.kind === 'num') {
    const lo = Math.max(a.lo, b.lo);
    const hi = Math.min(a.hi, b.hi);
    const loIn = (a.lo !== lo || a.loIn) && (b.lo !== lo || b.loIn);
    const hiIn = (a.hi !== hi || a.hiIn) && (b.hi !== hi || b.hiIn);
    return { kind: 'num', lo, loIn, hi, hiIn };
  }
  return null;
}

const empty = (d: Domain): boolean =>
  d.kind === 'set' ? d.values.size === 0 : d.lo > d.hi || (d.lo === d.hi && !(d.loIn && d.hiIn));

/** Conditions per attribute, as the guards of a path so far. */
type Guards = ReadonlyMap<string, Domain>;

/** `guards` and one rule's `when` together; `conflicts` names the attributes that cannot hold. */
function conjoin(guards: Guards, when: Record<string, Condition>) {
  const out = new Map(guards);
  const conflicts: string[] = [];
  for (const [attr, c] of Object.entries(when)) {
    const d = domainOf(c);
    if (!d) continue;
    const prev = out.get(attr);
    const next = prev ? intersect(prev, d) : d;
    if (!next) continue;
    out.set(attr, next);
    if (empty(next)) conflicts.push(attr);
  }
  return { guards: out as Guards, conflicts };
}

/** A decision rule table and the hypothesis it came from. */
export interface GuardedTable {
  key: string;
  table: DecisionTable;
}

/** One step of a path: at a decision point, the outcome that leads on. */
export interface PathStep {
  rule: string;
  screen: string;
  action: string;
  to: string;
}

export interface GuardConflict {
  path: PathStep[];
  /** The attributes no combination of the path's rules lets hold at once (from the last try). */
  attributes: string[];
}

/** The screen a rule's outcome leads to: the first word of `then` (`SC-0040 ok`). */
export const targetOf = (then: string): string => then.trim().split(/\s+/)[0] ?? '';

/**
 * Every path of two or more decision points whose guards cannot all hold. A path follows each
 * outcome screen to the decision points on it, never visits a screen twice and stops at
 * `maxDepth` steps or at its first conflict (its longer paths would only repeat it).
 */
export function guardConflicts(
  tables: readonly GuardedTable[],
  maxDepth: number = MODEL_DEFAULTS.guardPathDepth,
): GuardConflict[] {
  const on = new Map<string, GuardedTable[]>();
  for (const t of tables) {
    const list = on.get(t.table.decisionPoint.screen) ?? [];
    list.push(t);
    on.set(t.table.decisionPoint.screen, list);
  }
  const out: GuardConflict[] = [];
  const walk = (
    path: PathStep[],
    alive: readonly Guards[],
    seen: ReadonlySet<string>,
    screen: string,
  ): void => {
    if (path.length >= maxDepth) return;
    for (const t of on.get(screen) ?? [])
      for (const to of new Set(t.table.rules.map((r) => targetOf(r.then)))) {
        if (seen.has(to)) continue; // a loop or a validation that stays: not a path forward
        const step = { rule: t.key, screen, action: t.table.decisionPoint.action, to };
        const tries = t.table.rules
          .filter((r) => targetOf(r.then) === to)
          .flatMap((r) => alive.map((g) => conjoin(g, r.when)));
        const next = tries.filter((x) => x.conflicts.length === 0).map((x) => x.guards);
        const longer = [...path, step];
        if (next.length === 0) {
          if (longer.length >= 2) out.push({ path: longer, attributes: tries.at(-1)!.conflicts });
          continue;
        }
        walk(longer, next, new Set([...seen, to]), to);
      }
  };
  for (const screen of on.keys()) walk([], [new Map()], new Set([screen]), screen);
  return out;
}
