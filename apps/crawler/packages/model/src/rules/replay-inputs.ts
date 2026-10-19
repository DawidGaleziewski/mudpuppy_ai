/**
 * What a boundary test types (spec 039 design § 11.5): its inputs as field values by attribute
 * name, for the headless driver's replay of a reference journey. Pure.
 */

import { ageOf } from '../capture/attributes.js';

const DERIVED_AGE = /^derived\.(input\..+)\.age_years$/;
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ReplayInputs {
  /** `input.<attribute>` → the value to type. */
  values: Record<string, string>;
  /** Inputs a replay cannot set (a persona attribute, a shown value): the test is inconclusive. */
  unsupported: string[];
}

/**
 * A birth date that makes someone `years` old on `todayIso`, half a year past the birthday, so a
 * portal counting age by years, by days or by birthday agrees.
 */
export function birthDateFor(years: number, todayIso: string): string {
  const m = DATE_ISO.exec(todayIso.slice(0, 10));
  if (!m) throw new Error(`not an ISO date: ${todayIso}`);
  const d = new Date(Date.UTC(Number(m[1]) - years, Number(m[2]) - 1, Number(m[3])));
  d.setUTCMonth(d.getUTCMonth() - 6);
  return d.toISOString().slice(0, 10);
}

/**
 * The values of one test. `input.*` are typed as they are; `derived.input.<date>.age_years`
 * becomes that date field's value unless the test's own date already gives that age on
 * `todayIso` (the age is what a boundary test changes). Other attributes that differ from the
 * replayed execution (`reference`: a persona or shown value) cannot be set by a replay.
 */
export function replayInputs(
  inputs: Readonly<Record<string, number | string>>,
  reference: Readonly<Record<string, number | string>>,
  todayIso: string,
): ReplayInputs {
  const values: Record<string, string> = {};
  const unsupported: string[] = [];
  for (const [name, v] of Object.entries(inputs))
    if (name.startsWith('input.')) values[name] = String(v);
  for (const [name, v] of Object.entries(inputs).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (name.startsWith('input.')) continue;
    const age = DERIVED_AGE.exec(name);
    if (age && typeof v === 'number') {
      const date = values[age[1]!];
      if (date === undefined || ageOf(date, todayIso)?.years !== v)
        values[age[1]!] = birthDateFor(v, todayIso);
    } else if (reference[name] !== v) unsupported.push(name);
  }
  return { values, unsupported };
}
