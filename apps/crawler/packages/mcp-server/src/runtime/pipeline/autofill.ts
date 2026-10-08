import { maskText } from '@pathfinder/core';
import { autofillForm } from '@pathfinder/crawler';
import type { RunState } from '../run-state.js';
import type { ActionRow } from './actions.js';
import { decision, event, reported, type Reported } from './context.js';

/**
 * Fill the form `submit` belongs to with test data before map mode presses it (spec 008 FR-002,
 * research R9). A control that submits no form is left alone. A failure here never stops the
 * click: the portal then answers with its own validation, as before.
 */
export async function autofillBeforeSubmit(
  state: RunState,
  action: ActionRow,
  submit: Parameters<typeof autofillForm>[0],
): Promise<Reported<void>> {
  const mask = (v: string): string => (state.effective.portal.pii_scrub ? maskText(v) : v);
  try {
    const result = await autofillForm(submit, state.effective.persona.trace_inputs ?? {});
    if (result === null) return reported(undefined);
    const filled = result.filled.map((f) => ({ ...f, value: mask(f.value) }));
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
    return reported(undefined, reports);
  } catch (e) {
    return reported(undefined, [
      event('form_autofill', {
        action_id: action.id,
        filled: [],
        skipped: [],
        error: maskText((e as Error).message.split('\n')[0] ?? '').slice(0, 300),
      }),
    ]);
  }
}
