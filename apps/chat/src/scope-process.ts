// A saved process scope (spec 010) is also a BA process (spec 022 M5, T035): the first scope of a
// name creates the process with its as-is A r1; a later scope of the same name re-cuts the as-is
// as a new revision (nothing is overwritten). Migration 0018 did the same for older scopes.
// Synchronous, on the caller's connection, like setProcessScope.

import type BetterSqlite3 from 'better-sqlite3';
import { newId } from '@mudpuppy/core';
import type { ProcessScope } from '@mudpuppy/chat-model';
import { nextProcessKey, observedSteps, type StateRow } from './process-steps.js';

function scopeSteps(raw: BetterSqlite3.Database, scope: ProcessScope) {
  const ids = scope.selected_state_ids;
  const rows = raw
    .prepare(
      `SELECT id, title, route_template, screen_id FROM states WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .all(...ids) as StateRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const middle = rows
    .filter((r) => r.id !== scope.start_state_id && r.id !== scope.end_state_id)
    .sort((a, b) => a.route_template.localeCompare(b.route_template) || a.id.localeCompare(b.id));
  const ends = [byId.get(scope.start_state_id), ...middle, byId.get(scope.end_state_id)];
  const ordered = ends.filter((r): r is StateRow => r !== undefined);
  // Start and end may be the same screen: keep it once.
  return observedSteps(ordered.filter((r, i) => ordered.findIndex((o) => o.id === r.id) === i));
}

/** Create or re-cut the BA process of a just-saved scope; returns its key. */
export function syncScopeProcess(raw: BetterSqlite3.Database, scope: ProcessScope): string {
  const steps = JSON.stringify(scopeSteps(raw, scope));
  const at = scope.created_at;
  const existing = raw
    .prepare(
      `SELECT p.id, p.key, v.id AS model_id, v.rev FROM ba_processes p
       JOIN process_models v ON v.process_id = p.id AND v.label = 'A'
       WHERE p.portal_id = ? AND p.name = ?`,
    )
    .get(scope.portal_id, scope.process_name) as
    { id: string; key: string; model_id: string; rev: number } | undefined;
  const revision = raw.prepare(
    `INSERT INTO process_model_revisions (model_id, rev, base_rev, change, author, steps, note, run_id, restored_from, created_at)
     VALUES (?, ?, ?, ?, 'BA', ?, ?, NULL, NULL, ?)`,
  );
  if (existing !== undefined) {
    const rev = existing.rev + 1;
    raw.prepare('UPDATE process_models SET rev = ? WHERE id = ?').run(rev, existing.model_id);
    revision.run(existing.model_id, rev, existing.rev, 'save', steps, 'Scope saved again', at);
    raw.prepare('UPDATE ba_processes SET updated_at = ? WHERE id = ?').run(at, existing.id);
    return existing.key;
  }
  const keys = raw
    .prepare('SELECT key FROM ba_processes WHERE portal_id = ?')
    .all(scope.portal_id) as { key: string }[];
  const key = nextProcessKey(keys.map((k) => k.key));
  const processId = newId();
  const modelId = newId();
  raw
    .prepare(
      `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, scope_id, suggestion_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'scoped', 1, 'scope', ?, NULL, ?, ?)`,
    )
    .run(processId, scope.portal_id, key, scope.process_name, scope.persona, scope.id, at, at);
  raw
    .prepare(
      `INSERT INTO ba_process_revisions (process_id, rev, base_rev, change, author, name, stage, created_at)
       VALUES (?, 1, NULL, 'create', 'BA', ?, 'scoped', ?)`,
    )
    .run(processId, scope.process_name, at);
  raw
    .prepare(
      `INSERT INTO process_models (id, process_id, label, kind, rev, branched_from_model_id, branched_from_rev, created_at)
       VALUES (?, ?, 'A', 'as_is', 1, NULL, NULL, ?)`,
    )
    .run(modelId, processId, at);
  revision.run(modelId, 1, null, 'create', steps, 'From the saved process scope', at);
  return key;
}
