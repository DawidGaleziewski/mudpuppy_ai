// Deciding proposals in the chat service (spec 022 R6, FE-A04): Apply runs the proposal through
// the amendment service, so it is one revision with the base check like a BA edit; a moved head
// turns the proposal stale and nothing is overwritten. Undo is one more revision that puts back
// what was there before (restore), or withdraws the amendment the proposal created.

import { nowIso } from '@pathfinder/core';
import { ChatProposal, type Amendment } from '@pathfinder/chat-model';
import { type PathfinderDb } from '@pathfinder/store';
import { z } from 'zod';
import { type AmendmentService } from './amendments.js';
import { HttpError } from './http-error.js';

export const DecideProposalBody = z.object({
  author: z.string().trim().min(1).max(200).default('BA'),
});
export type DecideProposalBody = z.infer<typeof DecideProposalBody>;

export interface ProposalOutcome {
  proposal: ChatProposal;
  amendment: Amendment | null;
}

export interface ProposalService {
  apply(portal: string, id: string, body: DecideProposalBody): Promise<ProposalOutcome>;
  discard(portal: string, id: string, body: DecideProposalBody): Promise<ProposalOutcome>;
  /** Undo an applied proposal: one more revision that puts back what was there before. */
  undo(portal: string, id: string, body: DecideProposalBody): Promise<ProposalOutcome>;
}

interface Deps {
  db: PathfinderDb;
  amendments: AmendmentService;
}

type Decide = (d: Deps, portal: string, id: string, author: string) => Promise<ProposalOutcome>;

const STALE_MESSAGE =
  'The amendment changed after the assistant proposed this. Nothing was overwritten; ask again for a new proposal.';

const isStale = (e: unknown): e is HttpError =>
  e instanceof HttpError && e.status === 409 && e.extra.code === 'STALE_REVISION';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const targetKind = (v: unknown) => (v === 'wireframe_element' ? 'wireframe_element' : 'state');

async function load(db: PathfinderDb, portal: string, id: string): Promise<ChatProposal> {
  const row = await db
    .selectFrom('chat_proposals')
    .selectAll()
    .where('portal_id', '=', portal)
    .where('id', '=', id)
    .executeTakeFirst();
  if (row === undefined) throw new HttpError(404, 'This proposal does not exist.');
  return ChatProposal.parse({ ...row, payload: JSON.parse(row.payload) as unknown });
}

async function save(
  db: PathfinderDb,
  p: ChatProposal,
  changes: Partial<ChatProposal>,
): Promise<ChatProposal> {
  const next = ChatProposal.parse({ ...p, ...changes });
  await db
    .updateTable('chat_proposals')
    .set({ ...next, payload: JSON.stringify(next.payload) })
    .where('id', '=', p.id)
    .execute();
  return next;
}

/** The proposal as an amendment command: create, re-anchor or edit. */
function write(
  amendments: AmendmentService,
  portal: string,
  p: ChatProposal,
  author: string,
): Promise<Amendment> {
  const text = str(p.payload.text);
  const target = str(p.payload.target_id);
  if (p.amendment_id === null)
    return amendments.create(portal, {
      kind: p.payload.kind === 'element_ref' ? 'element_ref' : 'note',
      target_kind: targetKind(p.payload.target_kind),
      target_id: target ?? '',
      text,
      author,
    });
  const id = p.amendment_id;
  const base_rev = p.base_rev!;
  if (target !== undefined)
    return amendments.reapply(portal, id, {
      target_kind: targetKind(p.payload.target_kind),
      target_id: target,
      text,
      author,
      base_rev,
    });
  return amendments.edit(portal, id, { text: text ?? '', author, base_rev });
}

const apply: Decide = async (d, portal, id, author) => {
  const p = await load(d.db, portal, id);
  if (p.status === 'stale') throw new HttpError(409, STALE_MESSAGE, { code: 'STALE_PROPOSAL' });
  if (p.status !== 'open') throw new HttpError(409, `This proposal is already ${p.status}.`);
  let amendment: Amendment;
  try {
    amendment = await write(d.amendments, portal, p, author);
  } catch (error) {
    if (!isStale(error)) throw error;
    await save(d.db, p, { status: 'stale', decided_by: author, decided_at: nowIso() });
    throw new HttpError(409, STALE_MESSAGE, {
      code: 'STALE_PROPOSAL',
      latest: error.extra.latest ?? null,
    });
  }
  const proposal = await save(d.db, p, {
    status: 'applied',
    applied_amendment_id: amendment.id,
    applied_rev: amendment.rev,
    decided_by: author,
    decided_at: nowIso(),
  });
  return { proposal, amendment };
};

const discard: Decide = async (d, portal, id, author) => {
  const p = await load(d.db, portal, id);
  if (p.status !== 'open' && p.status !== 'stale')
    throw new HttpError(409, `This proposal is already ${p.status}.`);
  const proposal = await save(d.db, p, {
    status: 'discarded',
    decided_by: author,
    decided_at: nowIso(),
  });
  return { proposal, amendment: null };
};

const undo: Decide = async (d, portal, id, author) => {
  const p = await load(d.db, portal, id);
  if (p.status !== 'applied') throw new HttpError(409, 'Only an applied proposal can be undone.');
  const amendmentId = p.applied_amendment_id!;
  const base_rev = p.applied_rev!;
  const amendment =
    p.amendment_id === null
      ? await d.amendments.withdraw(portal, amendmentId, { author, base_rev })
      : await d.amendments.restore(portal, amendmentId, { rev: p.base_rev!, author, base_rev });
  // Undone: kept as discarded with what applying created, so the history stays readable.
  const proposal = await save(d.db, p, {
    status: 'discarded',
    decided_by: author,
    decided_at: nowIso(),
  });
  return { proposal, amendment };
};

export function createProposalService(deps: Deps): ProposalService {
  const busy = new Set<string>(); // one decision at a time per proposal
  const once =
    (decide: Decide) =>
    async (portal: string, id: string, body: DecideProposalBody): Promise<ProposalOutcome> => {
      if (busy.has(id)) throw new HttpError(409, 'This proposal is being decided right now.');
      busy.add(id);
      try {
        return await decide(deps, portal, id, body.author);
      } finally {
        busy.delete(id);
      }
    };
  return { apply: once(apply), discard: once(discard), undo: once(undo) };
}
