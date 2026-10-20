// The one write path for amendment changes (spec 022 R3, FR-004, FR-005): every change appends a
// row to `amendment_revisions` and moves the `amendments` head to it, in the caller's transaction.
// Nothing is deleted or overwritten without a revision; a write on a stale base is refused.

import { newId, nowIso } from '@pathfinder/core';
import { Amendment, AmendmentRevision, type AmendmentChange } from '@pathfinder/chat-model';
import { type PathfinderDb } from '@pathfinder/store';
import { HttpError } from './http-error.js';

type Row = Omit<Amendment, 'anchor_element'> & { anchor_element: string | null };
type RevisionRow = Omit<AmendmentRevision, 'anchor_element'> & { anchor_element: string | null };

export function parseAmendment(row: Row): Amendment {
  return Amendment.parse({
    ...row,
    anchor_element: row.anchor_element === null ? null : JSON.parse(row.anchor_element),
  });
}

export function parseRevision(row: RevisionRow): AmendmentRevision {
  return AmendmentRevision.parse({
    ...row,
    anchor_element: row.anchor_element === null ? null : JSON.parse(row.anchor_element),
  });
}

const json = (a: Amendment['anchor_element']): string | null =>
  a === null ? null : JSON.stringify(a);

/**
 * The amendment's anchor on the portal model (spec 039 § 15, T074): the model screen of the state
 * it is written on and its element key, as an `entity_refs` row. Null when the state is on no
 * model screen yet (the v1 fingerprint anchor then decides re-anchoring).
 */
async function anchorRef(trx: PathfinderDb, head: Amendment): Promise<string | null> {
  if (head.target_kind === 'evidence') return null;
  const stateId = head.target_id.split('#')[0]!;
  const member = await trx
    .selectFrom('screen_members')
    .select('screen_id')
    .where('state_id', '=', stateId)
    .where('to_model_version', 'is', null)
    .executeTakeFirst();
  if (member === undefined) return null;
  const id = newId();
  await trx
    .insertInto('entity_refs')
    .values({ id, screen_id: member.screen_id, element_key: head.anchor_element?.key ?? null })
    .execute();
  return id;
}

/** The head of an amendment of the portal, or 404. */
export async function loadHead(db: PathfinderDb, portal: string, id: string): Promise<Amendment> {
  const found = await db
    .selectFrom('amendments')
    .selectAll()
    .where('portal_id', '=', portal)
    .where('id', '=', id)
    .executeTakeFirst();
  if (found === undefined) throw new HttpError(404, 'This amendment does not exist.');
  return parseAmendment(found);
}

/** Refuse a write made on top of an older revision (FE-P05): the client shows the conflict. */
export function checkBase(head: Amendment, baseRev: number | undefined): void {
  if (baseRev === undefined || baseRev === head.rev) return;
  throw new HttpError(
    409,
    `${head.key} changed since you opened it (you had revision ${String(baseRev)}, it is now ${String(head.rev)}). Nothing was overwritten.`,
    { code: 'STALE_REVISION', latest: head },
  );
}

/** The revision row that mirrors a head. */
function revisionOf(
  head: Amendment,
  change: AmendmentChange,
  author: string,
  baseRev: number | null,
  meta: { reason?: string | null; run_id?: string | null },
): AmendmentRevision {
  return AmendmentRevision.parse({
    amendment_id: head.id,
    rev: head.rev,
    base_rev: baseRev,
    change,
    author,
    status: head.status,
    target_kind: head.target_kind,
    target_id: head.target_id,
    text: head.text,
    anchor_fingerprint: head.anchor_fingerprint,
    anchor_route_template: head.anchor_route_template,
    anchor_element: head.anchor_element,
    reason: meta.reason ?? null,
    run_id: meta.run_id ?? null,
    created_at: nowIso(),
  });
}

/** Revision 1 of a new amendment, written together with its head. */
export async function insertCreated(
  trx: PathfinderDb,
  head: Amendment,
  author: string,
): Promise<void> {
  await trx
    .insertInto('amendments')
    .values({
      ...head,
      anchor_element: json(head.anchor_element),
      ref_id: await anchorRef(trx, head),
    })
    .execute();
  const r = revisionOf(head, 'create', author, null, {});
  await trx
    .insertInto('amendment_revisions')
    .values({ ...r, anchor_element: json(r.anchor_element) })
    .execute();
}

/**
 * Move the head to a new revision: `changes` are applied to the current head, `rev` goes up by
 * one, and the revision row records who, why and on which base. Returns the new head.
 */
export async function writeRevision(
  trx: PathfinderDb,
  head: Amendment,
  change: AmendmentChange,
  author: string,
  changes: Partial<Amendment>,
  meta: { reason?: string | null; run_id?: string | null } = {},
): Promise<Amendment> {
  const next = Amendment.parse({ ...head, ...changes, rev: head.rev + 1 });
  const done = await trx
    .updateTable('amendments')
    .set({
      ...next,
      anchor_element: json(next.anchor_element),
      // A new place (re-anchored, moved along) gets a new model anchor.
      ...(next.target_id !== head.target_id ? { ref_id: await anchorRef(trx, next) } : {}),
    })
    .where('id', '=', head.id)
    .where('rev', '=', head.rev) // another writer got there first: no lost update
    .executeTakeFirst();
  if (Number(done.numUpdatedRows) !== 1)
    throw new HttpError(409, `${head.key} changed meanwhile. Nothing was overwritten.`, {
      code: 'STALE_REVISION',
    });
  const r = revisionOf(next, change, author, head.rev, meta);
  await trx
    .insertInto('amendment_revisions')
    .values({ ...r, anchor_element: json(r.anchor_element) })
    .execute();
  return next;
}

/** Every revision of an amendment, oldest first. */
export async function listRevisions(db: PathfinderDb, id: string): Promise<AmendmentRevision[]> {
  const rows = await db
    .selectFrom('amendment_revisions')
    .selectAll()
    .where('amendment_id', '=', id)
    .orderBy('rev')
    .execute();
  return rows.map((r) => parseRevision(r as RevisionRow));
}
