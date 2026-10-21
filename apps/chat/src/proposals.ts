// Proposals (spec 022 R6, FE-A04): the assistant proposes a change to the to-be, a person applies or
// discards it (proposal-service.ts). `proposeChange` runs in the pathfinder-chat MCP process and
// only writes an `open` row in `chat_proposals`, made on the amendment's current revision.

import type BetterSqlite3 from 'better-sqlite3';
import { SECRETS, newId, nowIso } from '@pathfinder/core';
import { ChatProposal, type Amendment } from '@pathfinder/chat-model';
import { z } from 'zod';

const Text = z.string().trim().min(1).max(50_000);
const Target = z.enum(['state', 'wireframe_element']);

/** propose_change input: an `amendment_id` changes that amendment; without one it is a new note. */
export const ProposeInput = z.object({
  portal: z.string().min(1),
  summary: z.string().trim().min(1).max(200),
  amendment_id: z.string().min(1).optional(),
  text: Text.optional(),
  target_kind: Target.optional(),
  target_id: z.string().min(1).max(2_000).optional(),
});
export type ProposeInput = z.infer<typeof ProposeInput>;

export class ProposalRefusal extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'INVALID',
    message: string,
  ) {
    super(message);
  }
}

interface HeadRow {
  id: string;
  key: string;
  rev: number;
  status: Amendment['status'];
}

type Draft = Pick<ChatProposal, 'amendment_id' | 'base_rev' | 'payload'>;

/** An edit (active amendment) or a re-anchor (one that needs it), on the head's revision. */
function changeOf(head: HeadRow, input: ProposeInput): Draft {
  const base = { amendment_id: head.id, base_rev: head.rev };
  if (head.status === 'active') {
    if (input.text === undefined)
      throw new ProposalRefusal('INVALID', `say the new text of ${head.key}`);
    return { ...base, payload: { text: SECRETS.redact(input.text) } };
  }
  if (head.status === 'needs_reanchor') {
    if (input.target_kind === undefined || input.target_id === undefined)
      throw new ProposalRefusal('INVALID', `name the target to re-anchor ${head.key} to`);
    return {
      ...base,
      payload: {
        target_kind: input.target_kind,
        target_id: input.target_id,
        ...(input.text === undefined ? {} : { text: SECRETS.redact(input.text) }),
      },
    };
  }
  throw new ProposalRefusal('INVALID', `${head.key} is ${head.status}; it cannot be changed`);
}

/** A new note on a recorded state, or on one of its elements (`<state id>#<element key>`). */
function creationOf(raw: BetterSqlite3.Database, input: ProposeInput): Draft {
  if (input.target_kind === undefined || input.target_id === undefined || input.text === undefined)
    throw new ProposalRefusal('INVALID', 'a new amendment needs target_kind, target_id and text');
  const stateId =
    input.target_kind === 'state' ? input.target_id : input.target_id.split('#', 1)[0]!;
  const found = raw
    .prepare('SELECT 1 FROM states WHERE portal_id = ? AND id = ?')
    .get(input.portal, stateId);
  if (found === undefined)
    throw new ProposalRefusal('NOT_FOUND', `${input.portal} has no recorded screen ${stateId}`);
  return {
    amendment_id: null,
    base_rev: null,
    payload: {
      kind: input.target_kind === 'wireframe_element' ? 'element_ref' : 'note',
      target_kind: input.target_kind,
      target_id: input.target_id,
      text: SECRETS.redact(input.text),
    },
  };
}

/** Store the proposal as `open`; nothing else changes until a person applies it. */
export function proposeChange(
  raw: BetterSqlite3.Database,
  conversationId: string,
  input: unknown,
): ChatProposal {
  const p = ProposeInput.parse(input);
  let draft: Draft;
  if (p.amendment_id === undefined) draft = creationOf(raw, p);
  else {
    const head = raw
      .prepare('SELECT id, key, rev, status FROM amendments WHERE portal_id = ? AND id = ?')
      .get(p.portal, p.amendment_id) as HeadRow | undefined;
    if (head === undefined)
      throw new ProposalRefusal('NOT_FOUND', `${p.portal} has no amendment ${p.amendment_id}`);
    draft = changeOf(head, p);
  }
  const row = ChatProposal.parse({
    id: newId(),
    conversation_id: conversationId,
    portal_id: p.portal,
    ...draft,
    summary: SECRETS.redact(p.summary),
    status: 'open',
    applied_amendment_id: null,
    applied_rev: null,
    decided_by: null,
    decided_at: null,
    created_at: nowIso(),
  });
  raw
    .prepare(
      `INSERT INTO chat_proposals (id, conversation_id, portal_id, amendment_id, base_rev,
         payload, summary, status, created_at)
       VALUES (@id, @conversation_id, @portal_id, @amendment_id, @base_rev, @payload,
         @summary, @status, @created_at)`,
    )
    .run({ ...row, payload: JSON.stringify(row.payload) });
  return row;
}
