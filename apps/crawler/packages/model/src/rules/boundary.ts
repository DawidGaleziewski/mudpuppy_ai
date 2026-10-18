/**
 * Decision rules as DMN-shaped tables and their boundary tests (spec 039 design § 11.4–11.5). The
 * miner proposes rules; the tests here are generated deterministically from them. Pure.
 */

export interface DmnInput {
  name: string;
  type: 'number' | 'date' | 'enum' | 'bool' | 'text';
}

/** One condition on an input: `< 18`, `>= 18`, `= premium`, `in [a, b]`. */
export type Condition = string;

export interface DmnRule {
  when: Record<string, Condition>;
  /** The outcome: target screen and step result, e.g. `SC-0040 ok`. */
  then: string;
}

export interface DecisionTable {
  decisionPoint: { screen: string; action: string };
  hitPolicy: 'U' | 'C';
  inputs: DmnInput[];
  outputs: { name: string; type: string }[];
  rules: DmnRule[];
  fitness: number;
  precision: number;
  rows: number;
}

export interface BoundaryTest {
  /** Input values to replay with; the rest are the reference row's. */
  inputs: Record<string, number | string>;
  /** The outcome the rule predicts for these inputs. */
  expect: string;
  /** The observation that would refute the rule (design § 11.5). */
  refutesIf: { notIn: string[] };
}

const NUMERIC = /^(<=|>=|<|>|=)\s*(-?\d+(?:\.\d+)?)$/;

/** Which outcomes the table allows for `values` (several when rules overlap, hit policy C). */
export function outcomesFor(
  table: DecisionTable,
  values: Record<string, number | string>,
): string[] {
  const holds = (c: Condition, v: number | string | undefined): boolean => {
    if (v === undefined) return false;
    const m = NUMERIC.exec(c.trim());
    if (m) {
      const [, op, raw] = m;
      const t = Number(raw);
      const x = Number(v);
      if (op === '<') return x < t;
      if (op === '<=') return x <= t;
      if (op === '>') return x > t;
      if (op === '>=') return x >= t;
      return x === t;
    }
    const eq = /^=\s*(.+)$/.exec(c.trim());
    if (eq) return String(v) === eq[1]!.trim();
    const list = /^in\s*\[(.*)\]$/.exec(c.trim());
    if (list)
      return list[1]!
        .split(',')
        .map((s) => s.trim())
        .includes(String(v));
    return false;
  };
  const out = table.rules
    .filter((r) => Object.entries(r.when).every(([k, c]) => holds(c, values[k])))
    .map((r) => r.then);
  return [...new Set(out)];
}

/**
 * Boundary tests (design § 11.5): for a numeric condition `x op t`, inputs at t − δ, t and t + δ
 * (δ = the attribute's smallest step: 1 by default, a year for ages, a day for dates); for a
 * categorical condition one test per value seen. Every other input keeps `reference`'s value. Each
 * test is refuted by any outcome the table does not predict for its inputs.
 */
export function boundaryTests(
  table: DecisionTable,
  reference: Record<string, number | string>,
  seen: Record<string, readonly string[]> = {},
  delta: Record<string, number> = {},
): BoundaryTest[] {
  const tests: BoundaryTest[] = [];
  const keys = new Set<string>();
  const add = (inputs: Record<string, number | string>) => {
    const k = JSON.stringify(Object.entries(inputs).sort());
    if (keys.has(k)) return;
    keys.add(k);
    const expected = outcomesFor(table, inputs);
    if (expected.length === 0) return;
    tests.push({ inputs, expect: expected.join(' | '), refutesIf: { notIn: expected } });
  };
  for (const input of table.inputs) {
    const thresholds = new Set<number>();
    for (const r of table.rules) {
      const m = NUMERIC.exec((r.when[input.name] ?? '').trim());
      if (m) thresholds.add(Number(m[2]));
    }
    const d = delta[input.name] ?? 1;
    for (const t of [...thresholds].sort((a, b) => a - b))
      for (const v of [t - d, t, t + d]) add({ ...reference, [input.name]: v });
    for (const v of seen[input.name] ?? []) add({ ...reference, [input.name]: v });
  }
  return tests;
}
