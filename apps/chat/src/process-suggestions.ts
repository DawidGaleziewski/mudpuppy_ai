// The assistant's grouping suggestions (spec 022 FR-007, screen 04): the assistant drafts a cut
// of recorded screens; a person accepts it (a saved process with as-is A r1), opens it to edit
// first, or dismisses it. A dismissed set of screens is never suggested again.

import { newId, nowIso } from '@pathfinder/core';
import { GroupingSuggestion } from '@pathfinder/chat-model';
import { type PathfinderDb } from '@pathfinder/store';
import { AcceptBody, AuthorBody, SuggestBody } from './process-bodies.js';
import { HttpError } from './http-error.js';
import { parseBody } from './http-io.js';
import { observedSteps, screensKey } from './process-steps.js';
import { insertProcess, parseRow, statesOf, type ProcessOutcome } from './process-store.js';

/** Store the assistant's suggestion; refuses a dismissed or already suggested set of screens. */
export async function suggestGrouping(
  db: PathfinderDb,
  portal: string,
  conversationId: string | null,
  raw: unknown,
): Promise<GroupingSuggestion> {
  const body = parseBody(SuggestBody, raw);
  return db.transaction().execute(async (trx) => {
    const states = await statesOf(trx, portal, body.state_ids);
    const key = screensKey(body.state_ids);
    const earlier = await trx
      .selectFrom('grouping_suggestions')
      .select(['status', 'name'])
      .where('portal_id', '=', portal)
      .where('screens_key', '=', key)
      .execute();
    const dismissed = earlier.find((e) => e.status === 'dismissed');
    if (dismissed !== undefined)
      throw new HttpError(
        409,
        `The BA dismissed a grouping of these screens ("${dismissed.name}"); do not suggest it again.`,
        { code: 'DISMISSED' },
      );
    if (earlier.length > 0)
      throw new HttpError(
        409,
        `These screens are already suggested or accepted as "${earlier[0]!.name}".`,
        { code: 'DUPLICATE' },
      );
    const suggestion = GroupingSuggestion.parse({
      id: newId(),
      portal_id: portal,
      name: body.name,
      persona: body.persona,
      steps: observedSteps(states),
      why: body.why,
      screens_key: key,
      status: 'open',
      conversation_id: conversationId,
      process_id: null,
      decided_by: null,
      decided_at: null,
      created_at: nowIso(),
    });
    await trx
      .insertInto('grouping_suggestions')
      .values({ ...suggestion, steps: JSON.stringify(suggestion.steps) })
      .execute();
    return suggestion;
  });
}

async function openSuggestion(
  trx: PathfinderDb,
  portal: string,
  id: string,
): Promise<GroupingSuggestion> {
  const row = await trx
    .selectFrom('grouping_suggestions')
    .selectAll()
    .where('portal_id', '=', portal)
    .where('id', '=', id)
    .executeTakeFirst();
  if (row === undefined) throw new HttpError(404, 'This suggestion does not exist.');
  const s = parseRow(GroupingSuggestion, row, ['steps']);
  if (s.status !== 'open')
    throw new HttpError(409, `This suggestion was already ${s.status}.`, { code: 'DECIDED' });
  return s;
}

/** Accept: a saved process with A r1 from the suggestion's screens, in its order. */
export async function acceptSuggestion(
  db: PathfinderDb,
  portal: string,
  suggestionId: string,
  raw: unknown,
): Promise<ProcessOutcome> {
  const body = parseBody(AcceptBody, raw);
  return db.transaction().execute(async (trx) => {
    const s = await openSuggestion(trx, portal, suggestionId);
    const ids = s.steps.flatMap((st) => (st.state_id === null ? [] : [st.state_id]));
    const outcome = await insertProcess(trx, portal, {
      name: body.name ?? s.name,
      persona: s.persona,
      states: await statesOf(trx, portal, ids),
      author: body.author,
      source: 'suggestion',
      suggestion_id: s.id,
    });
    await trx
      .updateTable('grouping_suggestions')
      .set({
        status: 'accepted',
        process_id: outcome.process.id,
        decided_by: body.author,
        decided_at: nowIso(),
      })
      .where('id', '=', s.id)
      .execute();
    return outcome;
  });
}

/** Dismiss: hidden, and never suggested again for the same screens. */
export async function dismissSuggestion(
  db: PathfinderDb,
  portal: string,
  suggestionId: string,
  raw: unknown,
): Promise<GroupingSuggestion> {
  const { author } = parseBody(AuthorBody, raw);
  return db.transaction().execute(async (trx) => {
    const s = await openSuggestion(trx, portal, suggestionId);
    const decided = { status: 'dismissed' as const, decided_by: author, decided_at: nowIso() };
    await trx.updateTable('grouping_suggestions').set(decided).where('id', '=', s.id).execute();
    return GroupingSuggestion.parse({ ...s, ...decided });
  });
}
