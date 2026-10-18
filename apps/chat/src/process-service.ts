// The write path for BA processes (spec 022 M5, FR-004, FR-005, FR-008): processes, their
// variants and revisions, per-person drafts, the live variant per environment and change spec
// revisions. Every change is a new revision row; a write on a stale base answers 409
// STALE_REVISION. A draft is the only row updated in place: one person's scratch over one to-be
// variant. Grouping suggestions are in process-suggestions.ts.

import { newId, nowIso } from '@pathfinder/core';
import {
  type BaProcess,
  ChangeSpecRevision,
  ProcessDraft,
  ProcessVariant,
} from '@pathfinder/chat-model';
import { type OpenedDb, type PathfinderDb } from '@pathfinder/store';
import { openFromRecord } from './process-from-record.js';
import {
  ArchiveBody,
  AuthorBody,
  BranchBody,
  EditAsIsBody,
  ChangeSpecBody,
  CreateProcessBody,
  DraftBody,
  LiveBody,
  ProcessChangeBody,
  RestoreBody,
  SaveBody,
} from './process-bodies.js';
import { HttpError } from './http-error.js';
import { parseBody } from './http-io.js';
import { checkSteps, editedSteps, editNote, nextLabel } from './process-steps.js';
import {
  insertProcess,
  insertVariantRevision,
  knownStates,
  loadProcess,
  loadRevision,
  loadVariant,
  parentStepIds,
  parseRow,
  stale,
  statesOf,
  usedStepIds,
  writeProcess,
  writeVariant,
  type ProcessOutcome,
} from './process-store.js';
import { acceptSuggestion, dismissSuggestion, suggestGrouping } from './process-suggestions.js';

/** "New process" from chosen screens, in the given order. */
async function create(db: PathfinderDb, portal: string, raw: unknown): Promise<ProcessOutcome> {
  const body = parseBody(CreateProcessBody, raw);
  return db.transaction().execute(async (trx) => {
    const states = await statesOf(trx, portal, body.state_ids);
    return insertProcess(trx, portal, { ...body, states, source: 'new' });
  });
}

/** Rename or move to another stage: one process revision; a stage move records A's revision. */
async function change(
  db: PathfinderDb,
  portal: string,
  id: string,
  raw: unknown,
): Promise<BaProcess> {
  const body = parseBody(ProcessChangeBody, raw);
  return db.transaction().execute(async (trx) => {
    const head = await loadProcess(trx, portal, id);
    const asIs = body.stage === undefined ? null : await loadVariant(trx, head.id, 'A');
    return writeProcess(trx, head, body.base_rev, {
      change: body.name !== undefined ? 'rename' : 'stage',
      author: body.author,
      name: body.name,
      stage: body.stage,
      as_is_rev: asIs?.rev ?? null,
    });
  });
}

/** Archive (`archived = true`) or restore a process: one revision, every row kept (FR-003). */
async function archive(
  db: PathfinderDb,
  portal: string,
  id: string,
  archived: boolean,
  raw: unknown,
): Promise<BaProcess> {
  const body = parseBody(ArchiveBody, raw);
  return db.transaction().execute(async (trx) => {
    const head = await loadProcess(trx, portal, id);
    if ((head.archived_at !== null) === archived)
      throw new HttpError(
        409,
        archived ? `${head.key} is archived already.` : `${head.key} is not archived.`,
        { code: 'UNCHANGED' },
      );
    return writeProcess(trx, head, body.base_rev, {
      change: archived ? 'archive' : 'unarchive',
      author: body.author,
      archived,
    });
  });
}

/**
 * A person's edit of the as-is (FR-004): A's screens in a new order, added or removed. A step
 * whose screen stays keeps its id and annotations; a new screen gets the next free `sN` id.
 */
async function editAsIs(
  db: PathfinderDb,
  portal: string,
  id: string,
  label: string,
  raw: unknown,
): Promise<ProcessOutcome> {
  const body = parseBody(EditAsIsBody, raw);
  return db.transaction().execute(async (trx) => {
    const process = await loadProcess(trx, portal, id);
    const head = await loadVariant(trx, process.id, label);
    if (head.kind !== 'as_is')
      throw new HttpError(409, 'A to-be variant changes in a draft; open it and save the draft.');
    const current = await loadRevision(trx, head.id, head.rev);
    const states = await statesOf(trx, portal, body.state_ids);
    const steps = editedSteps(current.steps, states, await usedStepIds(trx, head.id));
    const written = await writeVariant(trx, head, body.base_rev, {
      change: 'edit',
      author: body.author,
      steps,
      note: body.note ?? editNote(current.steps, steps),
    });
    return { process, ...written };
  });
}

/** A new to-be variant (B, C…) starting as a copy of a revision of another variant. */
async function branch(
  db: PathfinderDb,
  portal: string,
  id: string,
  raw: unknown,
): Promise<ProcessOutcome> {
  const body = parseBody(BranchBody, raw);
  return db.transaction().execute(async (trx) => {
    const process = await loadProcess(trx, portal, id);
    const from = await loadVariant(trx, process.id, body.from);
    const fromRev = await loadRevision(trx, from.id, body.from_rev ?? from.rev);
    const labels = await trx
      .selectFrom('process_variants')
      .select('label')
      .where('process_id', '=', process.id)
      .execute();
    const variant = ProcessVariant.parse({
      id: newId(),
      process_id: process.id,
      label: nextLabel(labels.map((l) => l.label)),
      kind: 'to_be',
      rev: 1,
      branched_from_variant_id: from.id,
      branched_from_rev: fromRev.rev,
      created_at: nowIso(),
    });
    await trx.insertInto('process_variants').values(variant).execute();
    // Each copied step comes from the step it copies, so Compare starts as all "unchanged".
    const revision = await insertVariantRevision(trx, {
      variant_id: variant.id,
      rev: 1,
      base_rev: null,
      change: 'branch',
      author: body.author,
      steps: fromRev.steps.map((s) => ({ ...s, from: [s.id] })),
      note: `Branched from ${from.label} r${String(fromRev.rev)}`,
      run_id: null,
      restored_from: null,
    });
    return { process, variant, revision };
  });
}

/** The to-be variant `label` of process `id`; the as-is is changed only by rescanning. */
async function toBe(trx: PathfinderDb, portal: string, id: string, label: string) {
  const process = await loadProcess(trx, portal, id);
  const variant = await loadVariant(trx, process.id, label);
  if (variant.kind !== 'to_be')
    throw new HttpError(
      409,
      'The as-is changes only by rescanning; branch a to-be variant to draw.',
    );
  return { process, variant };
}

async function loadDraft(
  trx: PathfinderDb,
  variantId: string,
  author: string,
): Promise<ProcessDraft> {
  const row = await trx
    .selectFrom('process_drafts')
    .selectAll()
    .where('variant_id', '=', variantId)
    .where('author', '=', author)
    .executeTakeFirst();
  if (row === undefined) throw new HttpError(404, 'There is no draft of yours on this variant.');
  return parseRow(ProcessDraft, row, ['steps']);
}

/** Autosave one person's draft over a to-be variant (replaces their previous draft). */
async function saveDraft(
  db: PathfinderDb,
  portal: string,
  id: string,
  label: string,
  raw: unknown,
): Promise<ProcessDraft> {
  const body = parseBody(DraftBody, raw);
  return db.transaction().execute(async (trx) => {
    const { variant } = await toBe(trx, portal, id, label);
    checkSteps(body.steps, {
      knownStates: await knownStates(trx, portal, body.steps),
      parentStepIds: await parentStepIds(trx, variant),
    });
    const draft = ProcessDraft.parse({
      variant_id: variant.id,
      author: body.author,
      base_rev: body.base_rev,
      steps: body.steps,
      updated_at: nowIso(),
    });
    const values = { ...draft, steps: JSON.stringify(draft.steps) };
    await trx
      .insertInto('process_drafts')
      .values(values)
      .onConflict((oc) => oc.columns(['variant_id', 'author']).doUpdateSet(values))
      .execute();
    return draft;
  });
}

/** Discard: the draft goes, the last revision stays (FE-P02). */
async function discardDraft(
  db: PathfinderDb,
  portal: string,
  id: string,
  label: string,
  raw: unknown,
) {
  const { author } = parseBody(AuthorBody, raw);
  return db.transaction().execute(async (trx) => {
    const { variant } = await toBe(trx, portal, id, label);
    const done = await trx
      .deleteFrom('process_drafts')
      .where('variant_id', '=', variant.id)
      .where('author', '=', author)
      .executeTakeFirst();
    return { discarded: Number(done.numDeletedRows) === 1 };
  });
}

/** Save the person's draft as rN+1; on a moved head the draft stays and 409 says so. */
async function saveRevision(
  db: PathfinderDb,
  portal: string,
  id: string,
  label: string,
  raw: unknown,
): Promise<ProcessOutcome> {
  const body = parseBody(SaveBody, raw);
  return db.transaction().execute(async (trx) => {
    const { process, variant: head } = await toBe(trx, portal, id, label);
    const draft = await loadDraft(trx, head.id, body.author);
    const written = await writeVariant(trx, head, body.base_rev, {
      change: 'save',
      author: body.author,
      steps: draft.steps,
      note: body.note ?? null,
    });
    await trx
      .deleteFrom('process_drafts')
      .where('variant_id', '=', head.id)
      .where('author', '=', body.author)
      .execute();
    return { process, ...written };
  });
}

/** Rebase: the draft keeps its steps and now starts from the head (screen 07 notice). */
async function rebaseDraft(
  db: PathfinderDb,
  portal: string,
  id: string,
  label: string,
  raw: unknown,
): Promise<ProcessDraft> {
  const { author } = parseBody(AuthorBody, raw);
  return db.transaction().execute(async (trx) => {
    const { variant } = await toBe(trx, portal, id, label);
    const draft = await loadDraft(trx, variant.id, author);
    const rebased = { ...draft, base_rev: variant.rev, updated_at: nowIso() };
    await trx
      .updateTable('process_drafts')
      .set({ base_rev: rebased.base_rev, updated_at: rebased.updated_at })
      .where('variant_id', '=', variant.id)
      .where('author', '=', author)
      .execute();
    return rebased;
  });
}

/** Restore an older revision as a new one (nothing is deleted). */
async function restore(
  db: PathfinderDb,
  portal: string,
  id: string,
  label: string,
  raw: unknown,
): Promise<ProcessOutcome> {
  const body = parseBody(RestoreBody, raw);
  return db.transaction().execute(async (trx) => {
    const process = await loadProcess(trx, portal, id);
    const head = await loadVariant(trx, process.id, label);
    const old = await loadRevision(trx, head.id, body.rev);
    const written = await writeVariant(trx, head, body.base_rev, {
      change: 'restore',
      author: body.author,
      steps: old.steps,
      note: `Restored r${String(body.rev)}`,
      restored_from: body.rev,
    });
    return { process, ...written };
  });
}

/** The BA marks which variant runs in an environment (append-only, newest wins). */
async function markLive(db: PathfinderDb, portal: string, id: string, raw: unknown) {
  const body = parseBody(LiveBody, raw);
  return db.transaction().execute(async (trx) => {
    const process = await loadProcess(trx, portal, id);
    const variant = await loadVariant(trx, process.id, body.label);
    const rev = body.rev ?? variant.rev;
    await loadRevision(trx, variant.id, rev);
    const row = {
      id: newId(),
      process_id: process.id,
      environment: body.environment,
      variant_id: variant.id,
      variant_rev: rev,
      author: body.author,
      reason: body.reason ?? null,
      created_at: nowIso(),
    };
    await trx.insertInto('process_live').values(row).execute();
    return { ...row, label: variant.label };
  });
}

/** A change spec revision: generated by the dashboard, edited by a person (FR-008). */
async function saveChangeSpec(
  db: PathfinderDb,
  portal: string,
  id: string,
  raw: unknown,
): Promise<ChangeSpecRevision> {
  const body = parseBody(ChangeSpecBody, raw);
  return db.transaction().execute(async (trx) => {
    const process = await loadProcess(trx, portal, id);
    const left = await loadVariant(trx, process.id, body.left.label);
    const right = await loadVariant(trx, process.id, body.right.label);
    await loadRevision(trx, left.id, body.left.rev);
    await loadRevision(trx, right.id, body.right.rev);
    const last = await trx
      .selectFrom('change_spec_revisions')
      .select(({ fn }) => fn.max('rev').as('rev'))
      .where('process_id', '=', process.id)
      .executeTakeFirst();
    const head = last?.rev ?? null;
    if (head !== null && body.base_rev !== head)
      throw stale(`The change spec of ${process.key}`, body.base_rev ?? 0, head, { rev: head });
    const spec = ChangeSpecRevision.parse({
      process_id: process.id,
      rev: (head ?? 0) + 1,
      base_rev: head,
      left_variant_id: left.id,
      left_rev: body.left.rev,
      right_variant_id: right.id,
      right_rev: body.right.rev,
      sections: body.sections,
      author: body.author,
      created_at: nowIso(),
      doc_key: null,
    });
    await trx
      .insertInto('change_spec_revisions')
      .values({ ...spec, sections: JSON.stringify(spec.sections) })
      .execute();
    return spec;
  });
}

/** The service the HTTP routes and the MCP tools call; each method is one transaction. */
export function createProcessService(deps: { db: PathfinderDb; raw?: OpenedDb['raw'] }) {
  const { db, raw: rawDb } = deps;
  return {
    /** Spec 027 US6.2; needs the raw handle (the record's steps come from @pathfinder/docs). */
    fromRecord: (portal: string, raw: unknown) => {
      if (rawDb === undefined) throw new HttpError(404, 'This address does not exist.');
      return openFromRecord(db, rawDb, portal, raw);
    },
    create: (portal: string, raw: unknown) => create(db, portal, raw),
    change: (portal: string, id: string, raw: unknown) => change(db, portal, id, raw),
    archive: (portal: string, id: string, raw: unknown) => archive(db, portal, id, true, raw),
    unarchive: (portal: string, id: string, raw: unknown) => archive(db, portal, id, false, raw),
    editAsIs: (portal: string, id: string, label: string, raw: unknown) =>
      editAsIs(db, portal, id, label, raw),
    branch: (portal: string, id: string, raw: unknown) => branch(db, portal, id, raw),
    saveDraft: (portal: string, id: string, label: string, raw: unknown) =>
      saveDraft(db, portal, id, label, raw),
    discardDraft: (portal: string, id: string, label: string, raw: unknown) =>
      discardDraft(db, portal, id, label, raw),
    saveRevision: (portal: string, id: string, label: string, raw: unknown) =>
      saveRevision(db, portal, id, label, raw),
    rebaseDraft: (portal: string, id: string, label: string, raw: unknown) =>
      rebaseDraft(db, portal, id, label, raw),
    restore: (portal: string, id: string, label: string, raw: unknown) =>
      restore(db, portal, id, label, raw),
    markLive: (portal: string, id: string, raw: unknown) => markLive(db, portal, id, raw),
    saveChangeSpec: (portal: string, id: string, raw: unknown) =>
      saveChangeSpec(db, portal, id, raw),
    suggest: (portal: string, conversationId: string | null, raw: unknown) =>
      suggestGrouping(db, portal, conversationId, raw),
    accept: (portal: string, suggestionId: string, raw: unknown) =>
      acceptSuggestion(db, portal, suggestionId, raw),
    dismiss: (portal: string, suggestionId: string, raw: unknown) =>
      dismissSuggestion(db, portal, suggestionId, raw),
  };
}

export type ProcessService = ReturnType<typeof createProcessService>;
