// "Open in Processes" (spec 027 US6.2): a workspace process (PRC) from a BA `process` record
// (PROC), with A's screens in the record's walking order (the same steps its export shows,
// `resolveProcessSteps`), linked to the record by `record_key`. A second open finds the linked
// process instead of making another; so does an archived one (the person restores it). Since spec
// 039 T070 every PROC record has its process from the start; the first open builds its A.

import { BaProcess } from '@pathfinder/chat-model';
import { resolveProcessSteps } from '@pathfinder/docs';
import { type OpenedDb, type PathfinderDb } from '@pathfinder/store';
import { FromRecordBody } from './process-bodies.js';
import { HttpError } from './http-error.js';
import { parseBody } from './http-io.js';
import { insertAsIs, insertProcess, statesOf, type ProcessOutcome } from './process-store.js';

type RawDb = OpenedDb['raw'];

export interface OpenedFromRecord extends ProcessOutcome {
  /** True when the record already had a linked process (nothing was created). */
  existing: boolean;
}

/** The record's name and persona from its latest revision (both required by its schema). */
function recordHead(raw: RawDb, portal: string, key: string): { name: string; persona: string } {
  const row = raw
    .prepare(
      `SELECT r.title, v.content_json FROM doc_records r
       JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
       WHERE r.portal_id = ? AND r.key = ? AND r.kind = 'process' AND r.withdrawn = 0`,
    )
    .get(portal, key) as { title: string; content_json: string } | undefined;
  if (row === undefined) throw new HttpError(404, `This portal has no process record ${key}.`);
  const content = JSON.parse(row.content_json) as { persona?: unknown };
  const persona =
    typeof content.persona === 'string' && content.persona ? content.persona : 'guest';
  return { name: row.title, persona };
}

export async function openFromRecord(
  db: PathfinderDb,
  raw: RawDb,
  portal: string,
  body: unknown,
): Promise<OpenedFromRecord> {
  const { record_key: key, author } = parseBody(FromRecordBody, body);
  return db.transaction().execute(async (trx) => {
    const linked = await trx
      .selectFrom('ba_processes')
      .selectAll()
      .where('portal_id', '=', portal)
      .where('record_key', '=', key)
      .orderBy('key')
      .executeTakeFirst();
    const hasA =
      linked !== undefined &&
      (await trx
        .selectFrom('process_models')
        .select('id')
        .where('process_id', '=', linked.id)
        .where('label', '=', 'A')
        .executeTakeFirst()) !== undefined;
    if (linked !== undefined && hasA) return { process: BaProcess.parse(linked), existing: true };
    const head = recordHead(raw, portal, key);
    const resolved = resolveProcessSteps(raw, portal, key);
    const walked = (resolved?.steps ?? []).filter((s) => !s.also_cited).map((s) => s.state_id);
    if (walked.length === 0)
      throw new HttpError(409, `${key} cites no screens to walk, so there is nothing to put in A.`);
    const states = await statesOf(trx, portal, walked);
    // The record's own process (spec 039 T070: every PROC record has one) gets its A now.
    if (linked !== undefined) {
      const made = await insertAsIs(trx, linked.id, { states, author, source: 'new' });
      return { process: BaProcess.parse(linked), ...made, existing: false };
    }
    const made = await insertProcess(trx, portal, {
      ...head,
      states,
      author,
      source: 'new',
      record_key: key,
    });
    return { ...made, existing: false };
  });
}
