import { newId } from '@mudpuppy/core';
import { ToolError } from '../../errors.js';
import type { BaContext } from '../../context.js';

/**
 * One process concept (spec 039 design § 13.4, T070): every PROC record documents exactly one
 * process (PRC). A record names the process it documents (`process_key`, e.g. one a person
 * accepted from a proposal); without it the server opens a new process for the record, as "Open
 * in Processes" did (spec 027 US6). A process that already has its record is refused: revise that
 * record instead (`PROCESS_DOCUMENTED`).
 */
export function processForRecord(
  ctx: BaContext,
  portal: string,
  record: { key: string; title: string; persona: string; processKey: string | undefined },
  ts: string,
): string {
  if (record.processKey !== undefined)
    return linkProcess(ctx, portal, record.key, record.processKey);
  const keys = ctx.raw.prepare('SELECT key FROM ba_processes WHERE portal_id = ?').all(portal) as {
    key: string;
  }[];
  const max = Math.max(0, ...keys.map((k) => Number(k.key.slice('PRC-'.length)) || 0));
  const id = newId();
  ctx.raw
    .prepare(
      `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, scope_id,
         suggestion_id, created_at, updated_at, archived_at, record_key)
       VALUES (?, ?, ?, ?, ?, 'scoped', 1, 'new', NULL, NULL, ?, ?, NULL, ?)`,
    )
    .run(
      id,
      portal,
      `PRC-${String(max + 1).padStart(3, '0')}`,
      record.title,
      record.persona,
      ts,
      ts,
      record.key,
    );
  ctx.raw
    .prepare(
      `INSERT INTO ba_process_revisions (process_id, rev, base_rev, change, author, name, stage, created_at)
       VALUES (?, 1, NULL, 'create', 'BA', ?, 'scoped', ?)`,
    )
    .run(id, record.title, ts);
  return id;
}

function linkProcess(
  ctx: BaContext,
  portal: string,
  recordKey: string,
  processKey: string,
): string {
  const row = ctx.raw
    .prepare(
      `SELECT p.id, (SELECT r.key FROM doc_records r WHERE r.process_id = p.id AND r.kind = 'process')
         AS documented
       FROM ba_processes p WHERE p.portal_id = ? AND p.key = ?`,
    )
    .get(portal, processKey) as { id: string; documented: string | null } | undefined;
  if (!row) throw new ToolError('PROCESS_UNKNOWN', `${processKey} is not a process of ${portal}`);
  if (row.documented)
    throw new ToolError(
      'PROCESS_DOCUMENTED',
      `${processKey} is documented by ${row.documented}: revise that record instead`,
      { record: row.documented },
    );
  ctx.raw
    .prepare('UPDATE ba_processes SET record_key = ? WHERE id = ? AND record_key IS NULL')
    .run(recordKey, row.id);
  return row.id;
}
