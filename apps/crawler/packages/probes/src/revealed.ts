// Fields an option reveals (spec 037 FR-002, F-04@036): "OC + Autocasco (AC)" adds "Wartość
// pojazdu (zł)". Probes start from the happy values, where the box does not exist, so it was
// filled with a test value and never probed. Once an option try shows which fields it adds, these
// tries probe them with that option chosen: the option's writes first, then the try's own writes
// on the form as read again.

import type { ProbeContext, ProbeTry } from './define.js';
import { boundaries, requiredEmptyOne, wrongFormat } from './catalogue/validation.js';

/** The validation probes that are about one field each. */
const PER_FIELD = [requiredEmptyOne, wrongFormat, boundaries];

/**
 * Validation tries on the fields `option` revealed. `revealed.fields` are those fields only, by
 * their index in the form read after the option was chosen; `revealed.base` their happy values.
 */
export function revealedTries(option: ProbeTry, revealed: ProbeContext): ProbeTry[] {
  if (option.group !== 'branch' || option.after !== undefined) return [];
  return PER_FIELD.flatMap((p) => p.tries(revealed)).map((t) => ({
    ...t,
    key: `${option.key}/${t.key}`,
    writes: option.writes,
    after: t.writes,
    summary: `${option.summary}, then ${t.summary}`,
  }));
}
