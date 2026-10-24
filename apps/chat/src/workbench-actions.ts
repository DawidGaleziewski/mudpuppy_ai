// A live surface's actions (spec 075, the R-96 spike; designer 19/13 "Writes are actions"): what the
// dashboard forwards from the person's screen. An answer to a choice becomes an event turn for the
// assistant; a write the person asks for (a new persona, stop or resume a scan) becomes a command
// card from a button, and nothing runs before its Confirm. Selection never comes here: it is the
// screen's own state.

import { HttpError } from './http-error.js';
import { answerText, choiceOf } from './workbench-choices.js';
import { asText, workbenchPortal, type Body, type WorkbenchDeps } from './workbench-service.js';

type Cards = { proposeFromButton(body: Body): { id: string } };

const VALUE = /^[A-Za-z0-9][A-Za-z0-9_./:-]{0,79}$/;

const contextOf = (body: Body): Record<string, unknown> =>
  typeof body.context === 'object' && body.context !== null && !Array.isArray(body.context)
    ? (body.context as Record<string, unknown>)
    : {};

/** The person's answer to a choice: checked against it, then told to the assistant. */
async function answer(deps: WorkbenchDeps, id: string, context: Record<string, unknown>): Promise<{ ok: true }> {
  const choice = choiceOf(deps.raw, id, asText(context.choice, 'choice', 64));
  if (choice === null) throw new HttpError(404, 'This choice does not exist.');
  const value = asText(context.value, 'value', 80);
  const given = choice.options?.find((o) => o.value === value);
  if (choice.options !== undefined && given === undefined) throw new HttpError(400, 'Pick one of the options.');
  if (!VALUE.test(value)) throw new HttpError(400, 'This is not a value to pick.');
  const label = given?.label ?? (typeof context.label === 'string' ? context.label.slice(0, 80) : value);
  await deps.service.sendEvent(id, answerText(choice, value, label));
  return { ok: true };
}

/** A card the person asked for from the screen (`source: button`). */
function card(cards: Cards, id: string, command: string, args: Record<string, unknown>): { command_id: string } {
  return { command_id: cards.proposeFromButton({ conversation_id: id, command, args }).id };
}

export async function liveAction(
  deps: WorkbenchDeps,
  cards: Cards,
  id: string,
  body: Body,
): Promise<unknown> {
  workbenchPortal(deps.raw, id);
  if (deps.live?.(id) !== true) throw new HttpError(409, 'Actions are for the live Workbench.');
  const name = asText(body.name, 'name', 64);
  const context = contextOf(body);
  switch (name) {
    case 'choice.answer':
      return answer(deps, id, context);
    case 'persona.new':
      return card(cards, id, 'persona.add', { name: typeof context.name === 'string' && context.name ? context.name : 'new-persona' });
    case 'scan.stop':
    case 'scan.resume':
      return card(cards, id, name, { scan: asText(context.scan, 'scan', 64) });
    default:
      throw new HttpError(400, `The action ${name} is not known.`);
  }
}
