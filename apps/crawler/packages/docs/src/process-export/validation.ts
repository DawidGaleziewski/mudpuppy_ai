// What a step's form says to wrong input (owner review 2026-10-17, point b): the validation
// probes' outcomes on the step's states (spec 032), one row per field, input tried and exact
// message. A native message is the browser's bubble (it leaves no trace in the page); a page
// message is text the page itself showed.

import type { RawDb } from '../keys.js';

export interface ValidationRow {
  /** The field the message belongs to (its accessible name); null for a form-level message. */
  field: string | null;
  /** What the probe did, in words: `left empty`, `typed "abc"`. */
  tried: string;
  /** The exact message; null when the form took the input without one. */
  message: string | null;
  /** `native` (the browser's bubble) or `dom` (text on the page). */
  source: string | null;
  /** The probe's catalogue id, e.g. `required-empty-one`. */
  probe: string;
  /** The form went on to the next page with this input. */
  accepted: boolean;
}

interface Outcome {
  probe_id: string;
  target: string | null;
  inputs_json: string;
  messages_json: string;
  accepted: number;
}

interface Input {
  name?: string;
  kind?: string;
  value?: string;
}

const PROBE_WORDS: Record<string, string> = {
  'required-empty-all': 'every field left empty',
  'required-empty-one': 'left empty',
  'optional-empty': 'only the required fields filled',
};

/** The probe's input for one field, in words. */
function tried(o: Outcome, field: string | null): string {
  const words = PROBE_WORDS[o.probe_id];
  if (words !== undefined) return words;
  const inputs = JSON.parse(o.inputs_json) as Input[];
  const typed = inputs.find((i) => i.name === (field ?? o.target));
  return typed?.value !== undefined ? `typed "${typed.value}"` : o.probe_id;
}

/** Every validation probe outcome on the given states, as rows; repeats of a row dropped. */
export function validationOf(raw: RawDb, stateIds: readonly string[]): ValidationRow[] {
  if (stateIds.length === 0) return [];
  const outcomes = raw
    .prepare(
      `SELECT probe_id, target, inputs_json, messages_json, accepted FROM probe_outcomes
       WHERE from_state_id IN (${stateIds.map(() => '?').join(',')}) AND probe_group = 'validation'
       ORDER BY probe_id, target, created_at, id`,
    )
    .all(...stateIds) as Outcome[];
  const out = new Map<string, ValidationRow>();
  for (const o of outcomes) {
    const messages = JSON.parse(o.messages_json) as {
      field: string | null;
      text: string | null;
      source: string | null;
    }[];
    const said = messages.length > 0 ? messages : [{ field: o.target, text: null, source: null }];
    for (const m of said) {
      const r: ValidationRow = {
        field: m.field,
        tried: tried(o, m.field),
        message: m.text,
        source: m.source,
        probe: o.probe_id,
        accepted: o.accepted === 1,
      };
      out.set(`${r.field}|${r.tried}|${r.message}`, r);
    }
  }
  return [...out.values()];
}
