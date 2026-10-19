/**
 * Decision points and their observation tables (spec 039 design § 11.1): an action class whose
 * executions, within one build epoch and environment, lead to two or more (target screen, result)
 * outcomes; one row per execution with the attribute snapshot just before it. Pure.
 */
import { ageOf, snapshotAt, type AttributeWrite, type JourneyLink } from '../capture/attributes.js';
import { compare } from '../model/clustering.js';

export interface Execution {
  /** The action class (`screen\u0000elementKey\u0000kind`). */
  actionClass: string;
  journeyId: string;
  seq: number;
  /** `<to screen key> <result>`, e.g. `SC-0040 ok`. */
  outcome: string;
  /** The build set and environment it ran in (`epoch`), and its capture time. */
  epoch: string;
  at: string;
}

export interface ObservationTable {
  decisionPoint: { actionClass: string; epoch: string };
  types: Record<string, string>;
  rows: { features: Record<string, number | string | null>; target: string }[];
}

/**
 * The tables for every decision point: executions grouped by action class and epoch, kept when
 * they reach two or more outcomes. Features are the snapshot names (`persona.*`, `input.*`,
 * `shown.*`) plus, for every date, `derived.<name>.age_years` at capture time.
 */
export function observationTables(
  executions: readonly Execution[],
  writes: readonly AttributeWrite[],
  journeys: ReadonlyMap<string, JourneyLink>,
): ObservationTable[] {
  const groups = new Map<string, Execution[]>();
  for (const e of executions) {
    const k = `${e.actionClass}\u0001${e.epoch}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const out: ObservationTable[] = [];
  for (const k of [...groups.keys()].sort(compare)) {
    const group = groups.get(k)!.sort((a, b) => compare(a.at, b.at) || a.seq - b.seq);
    if (new Set(group.map((g) => g.outcome)).size < 2) continue;
    const types: Record<string, string> = {};
    const rows = group.map((e) => {
      const snap = snapshotAt(writes, journeys, e.journeyId, e.seq);
      const features: Record<string, number | string | null> = {};
      for (const [name, w] of snap) {
        if (w.valueType === 'missing') continue;
        if (w.valueType === 'date' && w.valueText) {
          features[name] = w.valueText;
          types[name] ??= 'text';
          const age = ageOf(w.valueText, e.at);
          if (age) {
            features[`derived.${name}.age_years`] = age.years;
            types[`derived.${name}.age_years`] = 'number';
          }
          continue;
        }
        features[name] =
          w.valueType === 'number' || w.valueType === 'bool' ? w.valueNum : w.valueText;
        types[name] ??= w.valueType === 'number' || w.valueType === 'bool' ? 'number' : 'enum';
      }
      return { features, target: e.outcome };
    });
    out.push({
      decisionPoint: { actionClass: group[0]!.actionClass, epoch: group[0]!.epoch },
      types,
      rows,
    });
  }
  return out;
}
