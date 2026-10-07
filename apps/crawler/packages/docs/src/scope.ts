import type { RawDb } from './keys.js';
import type { ExportEvidence, ExportModel } from './render/model.js';

/**
 * A process scope (R-30, spec 010 FR-016): the states the BA picked for one process. A scoped export
 * keeps only records whose recorded evidence lies on those states (SC-005: 100% in scope).
 */
export interface ExportScope {
  name: string;
  stateIds: readonly string[];
}

/**
 * The states one evidence target sits on. `null` means the target has no state of its own
 * (another record, a review, a rule candidate): neutral, it neither keeps nor drops a record.
 * A broken target resolves to `[]` and counts as out of scope.
 */
export function evidenceStates(raw: RawDb, e: ExportEvidence): string[] | null {
  const one = (sql: string): string[] =>
    (raw.prepare(sql).all({ id: e.target_id }) as { s: string | null }[])
      .map((r) => r.s)
      .filter((s): s is string => s !== null);
  switch (e.target_kind) {
    case 'state':
    case 'screen_region':
      return [e.target_id];
    case 'action':
      return one('SELECT state_id AS s FROM actions WHERE id = @id');
    case 'form':
      return one('SELECT state_id AS s FROM forms WHERE id = @id');
    case 'edge':
      return one(
        'SELECT from_state AS s FROM edges WHERE id = @id UNION SELECT to_state FROM edges WHERE id = @id',
      );
    case 'network_call':
      return one(
        `SELECT e.from_state AS s FROM network_calls n JOIN edges e ON e.id = n.edge_id WHERE n.id = @id
         UNION SELECT e.to_state FROM network_calls n JOIN edges e ON e.id = n.edge_id WHERE n.id = @id`,
      );
    case 'process_step':
      return one(
        'SELECT state_before AS s FROM process_steps WHERE id = @id UNION SELECT state_after FROM process_steps WHERE id = @id',
      );
    case 'process':
      return one(
        `SELECT s.state_before AS s FROM process_steps s WHERE s.process_id = @id
         UNION SELECT s.state_after FROM process_steps s WHERE s.process_id = @id`,
      );
    default:
      return null;
  }
}

/**
 * Keep a record when it cites at least one state and every state it cites is in scope. A record
 * with only neutral evidence is kept when it cites a kept record (a glossary term of an in-scope
 * screen). Relations and the change log are cut to the kept records.
 */
export function applyScope(raw: RawDb, model: ExportModel, scope: ExportScope): ExportModel {
  const inScope = new Set(scope.stateIds);
  const kept = new Set<string>();
  const neutral: typeof model.records = [];
  for (const r of model.records) {
    const states = r.evidence
      .map((e) => evidenceStates(raw, e))
      .filter((s): s is string[] => s !== null);
    if (states.length === 0) neutral.push(r);
    else if (states.every((list) => list.length > 0 && list.every((s) => inScope.has(s))))
      kept.add(r.key);
  }
  for (const r of neutral)
    if (
      r.evidence.some(
        (e) => e.target_kind === 'doc_record' && e.doc_key !== null && kept.has(e.doc_key),
      )
    )
      kept.add(r.key);

  const records = model.records
    .filter((r) => kept.has(r.key))
    .map((r) => ({ ...r, relations: r.relations.filter((rel) => kept.has(rel.to_key)) }));
  return {
    ...model,
    records,
    change_log: model.change_log.filter((c) => kept.has(c.key)),
    scope: { name: scope.name, state_ids: [...scope.stateIds].sort() },
  };
}
