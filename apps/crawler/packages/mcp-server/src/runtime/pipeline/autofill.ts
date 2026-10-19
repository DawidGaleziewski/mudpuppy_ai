import { maskText } from '@pathfinder/core';
import { autofillForm } from '@pathfinder/crawler';
import { attributeName } from '@pathfinder/model';
import type { RunState } from '../run-state.js';
import type { ActionRow } from './actions.js';
import { decision, event, reported, type Reported } from './context.js';

/** A fill by visible label, the way a trace repeats it (spec 032: the run's path to a form step). */
export interface LabelFill {
  name: string;
  kind: 'fill' | 'select' | 'check';
  value?: string;
}

/** Autofill's writes as label steps: test values, synthetic by construction, so kept unmasked. */
function labelFills(
  filled: readonly { type: string; value: string; label: string }[],
): LabelFill[] {
  return filled
    .filter((f) => f.label !== '')
    .map((f) =>
      f.type === 'checkbox' || f.type === 'radio'
        ? { name: f.label, kind: 'check' as const }
        : {
            name: f.label,
            kind: f.type === 'select' ? ('select' as const) : ('fill' as const),
            value: f.value,
          },
    );
}

/**
 * The persona's test data by label; a replay run's inputs (by attribute name, spec 039 design
 * § 9) come first.
 */
function inputsOf(state: RunState) {
  const testData = state.effective.persona.test_data;
  const replay = state.headless?.inputs;
  if (!replay) return testData;
  return (label: string): string | undefined =>
    replay[`input.${attributeName(label)}`] ?? testData[label];
}

/**
 * Fill the form `submit` belongs to with test data before map mode presses it (spec 008 FR-002,
 * research R9). A control that submits no form is left alone. A failure here never stops the
 * click: the portal then answers with its own validation, as before.
 */
export async function autofillBeforeSubmit(
  state: RunState,
  action: ActionRow,
  submit: Parameters<typeof autofillForm>[0],
): Promise<Reported<LabelFill[]>> {
  const mask = (v: string): string => (state.effective.portal.pii_scrub ? maskText(v) : v);
  try {
    const result = await autofillForm(submit, inputsOf(state));
    if (result === null) return reported([]);
    const filled = result.filled.map(({ field, type, value }) => ({
      field,
      type,
      value: mask(value),
    }));
    const reports = [
      event('form_autofill', { action_id: action.id, filled, skipped: result.skipped }),
    ];
    if (filled.length > 0)
      reports.push(
        decision({
          kind: 'note',
          rule: 'form_autofill',
          reason: `filled ${filled.length} field(s) with test data before pressing ${action.role} ${JSON.stringify(action.accessible_name ?? '')}`,
          subject_ref: action.id,
          detail: { filled, skipped: result.skipped },
        }),
      );
    return reported(labelFills(result.filled), reports);
  } catch (e) {
    return reported(
      [],
      [
        event('form_autofill', {
          action_id: action.id,
          filled: [],
          skipped: [],
          error: maskText((e as Error).message.split('\n')[0] ?? '').slice(0, 300),
        }),
      ],
    );
  }
}
