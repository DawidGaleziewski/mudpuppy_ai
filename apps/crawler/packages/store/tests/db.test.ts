import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dbPathFor, openDb, type OpenedDb } from '../src/db.js';
import { appliedVersions, loadMigrations, migrateDown, migrateUp } from '../src/migrate.js';
import { newId, nowIso } from '@mudpuppy/core';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));

const ALL = [
  '0001',
  '0002',
  '0003',
  '0004',
  '0005',
  '0006',
  '0007',
  '0008',
  '0009',
  '0010',
  '0011',
  '0012',
  '0013',
  '0014',
  '0015',
  '0016',
  '0017',
  '0018',
  '0019',
  '0020',
  '0021',
  '0022',
  '0023',
  '0024',
  '0025',
  '0026',
  '0027',
  '0028',
  '0029',
  '0030',
  '0031',
  '0032',
  '0033',
  '0034',
  '0035',
  '0036',
  '0037',
  '0038',
  '0039',
  '0040',
  '0041',
  '0042',
  '0043',
  '0044',
  '0045',
  '0046',
  '0047',
  '0048',
  '0049',
  '0050',
  '0051',
];

let opened: OpenedDb | undefined;
let tmp: string | undefined;
afterEach(async () => {
  await opened?.close();
  opened = undefined;
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

const tables = (o: OpenedDb) =>
  (
    o.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .sort();

describe('migrations', () => {
  it('finds 0001_init through 0051_process_scope_merge, each with an up and a down', () => {
    expect(loadMigrations(MIGRATIONS).map((m) => m.version)).toEqual(ALL);
  });

  it('applies up in order, is idempotent, and reverts down to empty', () => {
    opened = openDb(':memory:');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(ALL);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([]);
    expect(appliedVersions(opened.raw)).toEqual(ALL);
    expect(tables(opened)).toEqual(
      expect.arrayContaining([
        'states',
        'frontier',
        'decision_log',
        'robots_policies',
        'portal_data_log',
        'trace_boots',
        'trace_spans',
        'agent_turns',
        'analysis_sessions',
        'analysis_session_runs',
        'doc_records',
        'doc_revisions',
        'doc_evidence_links',
        'doc_relations',
        'doc_reviews',
        'followup_tasks',
        'processes',
        'process_steps',
        'state_wireframes',
        'credentials',
      ]),
    );
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0014');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0013');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0012');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0011');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0010');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0009');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0008');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0007');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0006');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0005');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0004');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0003');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0002');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0001');
    expect(tables(opened)).toEqual(['schema_migrations']);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBeNull();
  });

  it('0002 applies and reverts on a DB holding 0001 data (up, up, down, down, up: round-trips cleanly)', () => {
    opened = openDb(':memory:');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(ALL);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([]);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0014');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0013');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0012');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0011');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0010');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0009');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0008');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0007');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0006');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0005');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0004');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0003');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0002');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0001');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(ALL);
    expect(appliedVersions(opened.raw)).toEqual(ALL);
  });

  it('0003_trace applies and reverts on a DB holding 0001/0002 data (up, down, up round-trips cleanly)', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0014');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0013');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0012');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0011');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0010');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0009');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0008');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0007');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0006');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0005');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0004');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0003');
    expect(tables(opened)).not.toEqual(
      expect.arrayContaining(['trace_boots', 'trace_spans', 'agent_turns']),
    );
    expect(tables(opened)).toEqual(expect.arrayContaining(['states', 'frontier', 'decision_log']));
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0003',
      '0004',
      '0005',
      '0006',
      '0007',
      '0008',
      '0009',
      '0010',
      '0011',
      '0012',
      '0013',
      '0014',
      '0015',
      '0016',
      '0017',
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);
    expect(appliedVersions(opened.raw)).toEqual(ALL);
    expect(tables(opened)).toEqual(
      expect.arrayContaining(['trace_boots', 'trace_spans', 'agent_turns']),
    );
  });
});

describe('trace tables (0003_trace)', () => {
  // Raw better-sqlite3 statements throughout (not the Kysely `db` builder): these tables' Zod
  // schemas and Kysely types land in a separate task; this test only exercises the migration's
  // own CHECK/FK/UNIQUE constraints.
  it('enforces Principle II-style CHECKs: enums, json shape, rationale length, duration requirement', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { raw } = opened;
    const ts = nowIso();
    const bootId = newId();

    raw
      .prepare(
        `INSERT INTO trace_boots (id, started_at, ended_at, environment, server, pid, version, trace_level, pw_trace)
         VALUES (?, ?, NULL, 'sandbox', 'mudpuppy', 1234, '0.0.0-test', 'standard', 'non_production')`,
      )
      .run(bootId, ts);

    // bad enum on trace_boots.server
    expect(() =>
      raw
        .prepare(
          `INSERT INTO trace_boots (id, started_at, environment, server, pid, version, trace_level, pw_trace)
           VALUES (?, ?, 'sandbox', 'other', 1, 'v', 'standard', 'non_production')`,
        )
        .run(newId(), ts),
    ).toThrow();

    const insertSpan = raw.prepare(
      `INSERT INTO trace_spans
         (id, boot_id, seq, run_id, parent_id, kind, name, status, started_at, ended_at,
          duration_ms, attrs_json, payload_ref, summary, decision_id, tool_use_id, agent_id,
          rationale, pw_trace_path, between_calls)
       VALUES (@id, @boot_id, @seq, @run_id, @parent_id, @kind, @name, @status, @started_at, @ended_at,
               @duration_ms, @attrs_json, @payload_ref, @summary, @decision_id, @tool_use_id, @agent_id,
               @rationale, @pw_trace_path, @between_calls)`,
    );
    const baseSpan = {
      id: undefined as unknown as string,
      boot_id: bootId,
      seq: undefined as unknown as number,
      run_id: null,
      parent_id: null as string | null,
      kind: 'call',
      name: 'navigate',
      status: 'ok',
      started_at: ts,
      ended_at: ts as string | null,
      duration_ms: 5 as number | null,
      attrs_json: '{}',
      payload_ref: null,
      summary: 'ok',
      decision_id: null,
      tool_use_id: 'tu_1',
      agent_id: null,
      rationale: null as string | null,
      pw_trace_path: null,
      between_calls: 0,
    };

    const spanId = newId();
    insertSpan.run({ ...baseSpan, id: spanId, seq: 1, rationale: 'checking the home page' });

    // duration_ms required on a completed call
    expect(() =>
      insertSpan.run({
        ...baseSpan,
        id: newId(),
        seq: 2,
        tool_use_id: 'tu_2',
        duration_ms: null,
      }),
    ).toThrow();

    // rationale over 300 chars
    expect(() =>
      insertSpan.run({
        ...baseSpan,
        id: newId(),
        seq: 3,
        tool_use_id: 'tu_3',
        status: 'running',
        ended_at: null,
        duration_ms: null,
        rationale: 'x'.repeat(301),
      }),
    ).toThrow();

    // duplicate (boot_id, seq)
    expect(() =>
      insertSpan.run({
        ...baseSpan,
        id: newId(),
        seq: 1,
        tool_use_id: 'tu_4',
        status: 'running',
        ended_at: null,
        duration_ms: null,
      }),
    ).toThrow();

    // attrs_json must be a JSON object, not just valid JSON
    expect(() =>
      insertSpan.run({
        ...baseSpan,
        id: newId(),
        seq: 5,
        parent_id: spanId,
        kind: 'event',
        name: 'note',
        tool_use_id: null,
        attrs_json: '[]',
      }),
    ).toThrow();

    // agent_turns: bad role enum
    expect(() =>
      raw
        .prepare(
          `INSERT INTO agent_turns
             (id, agent_id, agent_type, message_uuid, block_index, role, kind, matched, created_at, imported_at)
           VALUES (?, 'a', 'crawler', 'm1', 0, 'system', 'text', 0, ?, ?)`,
        )
        .run(newId(), ts, ts),
    ).toThrow();

    // agent_turns: duplicate (agent_id, message_uuid, block_index)
    raw
      .prepare(
        `INSERT INTO agent_turns
           (id, agent_id, agent_type, message_uuid, block_index, role, kind, text, matched, created_at, imported_at)
         VALUES (?, 'a', 'crawler', 'm1', 0, 'assistant', 'text', 'hi', 0, ?, ?)`,
      )
      .run(newId(), ts, ts);
    expect(() =>
      raw
        .prepare(
          `INSERT INTO agent_turns
             (id, agent_id, agent_type, message_uuid, block_index, role, kind, text, matched, created_at, imported_at)
           VALUES (?, 'a', 'crawler', 'm1', 0, 'user', 'text', 'dup', 0, ?, ?)`,
        )
        .run(newId(), ts, ts),
    ).toThrow();
  });
});

describe('Layer B tables (0004_ba_documentation)', () => {
  it('0004 round-trips (up, down, up) on a DB holding Layer B data (T007)', async () => {
    opened = openDb(':memory:');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual(ALL);
    const ts = nowIso();
    const { runId, stateId } = await seedRunAndState(opened, 'p', 'b'.repeat(64));
    const sessionId = newId();
    opened.raw
      .prepare(
        `INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json, started_at, ended_at)
         VALUES (?, 'p', 'running', '[]', NULL, '[]', ?, NULL)`,
      )
      .run(sessionId, ts);
    opened.raw
      .prepare(`INSERT INTO analysis_session_runs (session_id, run_id) VALUES (?, ?)`)
      .run(sessionId, runId);
    const recordId = newId();
    opened.raw
      .prepare(
        `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn, created_at, updated_at)
         VALUES (?, 'p', 'capability', 'CAP-001', 1, 'Compare products', 1, NULL, 0, ?, ?)`,
      )
      .run(recordId, ts, ts);
    const revisionId = newId();
    opened.raw
      .prepare(
        `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence, not_observable, status, change_note, responds_to_review, created_at)
         VALUES (?, ?, 1, ?, 'create', '{"kind":"capability","title":"Compare products","description":"..."}', 'observed', 0, 'draft', NULL, NULL, ?)`,
      )
      .run(revisionId, recordId, sessionId, ts);
    opened.raw.prepare(`INSERT INTO entity_refs (id, state_id) VALUES ('ref-1', ?)`).run(stateId);
    opened.raw
      .prepare(
        `INSERT INTO doc_evidence_links (id, revision_id, ref_id, run_id, note) VALUES (?, ?, 'ref-1', ?, NULL)`,
      )
      .run(newId(), revisionId, runId);
    opened.raw
      .prepare(
        `INSERT INTO doc_reviews (id, revision_id, action, reviewer, text, created_at) VALUES (?, ?, 'comment', 'dawid', 'looks good', ?)`,
      )
      .run(newId(), revisionId, ts);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0014');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0013');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0012');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0011');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0010');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0009');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0008');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0007');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0006');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0005');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0004');
    expect(tables(opened)).not.toEqual(expect.arrayContaining(['doc_records', 'doc_revisions']));
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0004',
      '0005',
      '0006',
      '0007',
      '0008',
      '0009',
      '0010',
      '0011',
      '0012',
      '0013',
      '0014',
      '0015',
      '0016',
      '0017',
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);
    expect(opened.raw.prepare('SELECT count(*) AS n FROM doc_records').get()).toEqual({ n: 0 });
  });
});

describe('screenshots and wireframes (0006_screenshots_wireframes)', () => {
  /** A revision of one record, ready for evidence links. */
  async function seedRevision(o: OpenedDb): Promise<{
    runId: string;
    stateId: string;
    revisionId: string;
  }> {
    const ts = nowIso();
    const { runId, stateId } = await seedRunAndState(o, 'p', 'd'.repeat(64));
    const sessionId = newId();
    o.raw
      .prepare(
        `INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json, started_at, ended_at)
         VALUES (?, 'p', 'running', '[]', NULL, '[]', ?, NULL)`,
      )
      .run(sessionId, ts);
    const recordId = newId();
    o.raw
      .prepare(
        `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn, created_at, updated_at)
         VALUES (?, 'p', 'data_item', 'DI-001', 1, 'Engine capacity', 1, NULL, 0, ?, ?)`,
      )
      .run(recordId, ts, ts);
    const revisionId = newId();
    o.raw
      .prepare(
        `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence, not_observable, status, change_note, responds_to_review, created_at)
         VALUES (?, ?, 1, ?, 'create', '{"kind":"data_item","title":"Engine capacity"}', 'observed', 0, 'draft', NULL, NULL, ?)`,
      )
      .run(revisionId, recordId, sessionId, ts);
    return { runId, stateId, revisionId };
  }
  /** A screen region (spec 008) is, since 0040, a state ref with an element key (spec 039 § 15). */
  const region = (o: OpenedDb, revisionId: string, stateId: string, run: string, key: string) => {
    const ref = newId();
    o.raw
      .prepare('INSERT INTO entity_refs (id, state_id, element_key) VALUES (?, ?, ?)')
      .run(ref, stateId, key);
    o.raw
      .prepare(
        `INSERT INTO doc_evidence_links (id, revision_id, ref_id, run_id, note) VALUES (?, ?, ?, ?, 'n')`,
      )
      .run(newId(), revisionId, ref, run);
  };

  it('keeps a screen region as a state ref with a key, and screenshot refs nullable', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { runId, stateId, revisionId } = await seedRevision(opened);
    region(opened, revisionId, stateId, runId, 'textbox "Pojemność silnika"');
    expect(
      opened.raw.prepare('SELECT target_kind, target_id, region FROM doc_evidence').all(),
    ).toEqual([
      { target_kind: 'screen_region', target_id: stateId, region: 'textbox "Pojemność silnika"' },
    ]);
    expect(() => region(opened!, revisionId, stateId, runId, '')).toThrow(/CHECK/);
    const ref = opened.raw.prepare(
      'INSERT INTO entity_refs (id, transition_id, element_key) VALUES (?, NULL, ?)',
    );
    expect(() => ref.run(newId(), 'button "x"')).toThrow(/CHECK/); // a key needs a state or a screen
    expect(() =>
      opened!.raw
        .prepare(
          `INSERT INTO doc_evidence_links (id, revision_id, ref_id, run_id) VALUES (?, ?, 'nope', ?)`,
        )
        .run(newId(), revisionId, runId),
    ).toThrow(/FOREIGN KEY/);
    const s = opened.raw
      .prepare('SELECT screenshot_ref, layout_ref FROM states WHERE id = ?')
      .get(stateId);
    expect(s).toEqual({ screenshot_ref: null, layout_ref: null });
    expect(() =>
      opened!.raw
        .prepare(`INSERT INTO state_wireframes VALUES (?, '', 'a.svg', 'a.excalidraw', ?)`)
        .run(stateId, nowIso()),
    ).toThrow(/CHECK/);
  });

  it('round-trips (up, down, up): screen_region links become state links with the key in note', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { runId, stateId, revisionId } = await seedRevision(opened);
    region(opened, revisionId, stateId, runId, 'button "Oblicz"');
    opened.raw
      .prepare(`INSERT INTO state_wireframes VALUES (?, '1', 'a.svg', 'a.excalidraw', ?)`)
      .run(stateId, nowIso());
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0014');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0013');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0012');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0011');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0010');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0009');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0008');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0007');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0006');
    expect(tables(opened)).not.toContain('state_wireframes');
    expect(opened.raw.prepare('SELECT target_kind, note FROM doc_evidence_links').all()).toEqual([
      { target_kind: 'state', note: 'region button "Oblicz": n' },
    ]);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0006',
      '0007',
      '0008',
      '0009',
      '0010',
      '0011',
      '0012',
      '0013',
      '0014',
      '0015',
      '0016',
      '0017',
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);
    expect(opened.raw.prepare('SELECT target_kind, region FROM doc_evidence').all()).toEqual([
      { target_kind: 'state', region: null },
    ]);
  });
});

describe('credentials (0007_credentials)', () => {
  const insert = (o: OpenedDb, env: string, nonceLen = 12, keyId = 'abcdef01') =>
    o.raw
      .prepare(
        `INSERT INTO credentials (id, portal_id, environment, ref_name, ciphertext, nonce, key_id, created_at, updated_at)
         VALUES (?, 'p', ?, 'USER_PASSWORD', ?, ?, ?, ?, ?)`,
      )
      .run(newId(), env, Buffer.alloc(20), Buffer.alloc(nonceLen), keyId, nowIso(), nowIso());

  it('enforces the environment enum, nonce and key id lengths and uniqueness', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    insert(opened, 'sandbox');
    expect(() => insert(opened!, 'sandbox')).toThrow(/UNIQUE/);
    // Free names since 0021 (spec 030 R-61); a malformed one is still refused.
    insert(opened, 'dev');
    expect(() => insert(opened!, 'Dev')).toThrow(/CHECK/);
    expect(() => insert(opened!, 'staging', 11)).toThrow(/CHECK/);
    expect(() => insert(opened!, 'staging', 12, 'abc')).toThrow(/CHECK/);
  });

  it('round-trips (up, down, up)', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0014');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0013');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0012');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0011');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0010');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0009');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0008');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0007');
    expect(tables(opened)).not.toContain('credentials');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0007',
      '0008',
      '0009',
      '0010',
      '0011',
      '0012',
      '0013',
      '0014',
      '0015',
      '0016',
      '0017',
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);
    expect(tables(opened)).toContain('credentials');
  });
});

describe('chat orchestrator tables (0008_chat_orchestrator)', () => {
  const ts = () => nowIso();
  let amdSeq = 0;
  const conv = (o: OpenedDb, portal: string | null = 'p') => {
    const id = newId();
    o.raw
      .prepare(
        `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES (?, ?, 'g', ?, ?)`,
      )
      .run(id, portal, ts(), ts());
    return id;
  };
  // 0041: an amendment cites what it is written on through a ref (an evidence file needs no row).
  const amd = (o: OpenedDb, cols: string, vals: unknown[]) => {
    const ref = newId();
    o.raw.prepare(`INSERT INTO entity_refs (id, evidence_file) VALUES (?, 'e.png')`).run(ref);
    return o.raw
      .prepare(
        `INSERT INTO amendments (id, key, portal_id, ref_id, kind, author, created_at, ${cols})
         VALUES (?, ?, 'p', ?, 'note', 'ba', ?, ${vals.map(() => '?').join(',')})`,
      )
      .run(newId(), `AMD-${String(++amdSeq).padStart(3, '0')}`, ref, ts(), ...vals);
  };

  it('enforces enums, message order and amendment invariants', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const c = conv(opened);
    const msg = (seq: number, role: string) =>
      opened!.raw
        .prepare(
          `INSERT INTO chat_messages (id, conversation_id, seq, role, content, created_at) VALUES (?, ?, ?, ?, 'x', ?)`,
        )
        .run(newId(), c, seq, role, ts());
    msg(0, 'user');
    expect(() => msg(0, 'user')).toThrow(/UNIQUE/);
    expect(() => msg(1, 'bot')).toThrow(/CHECK/);
    expect(() =>
      opened!.raw
        .prepare(
          `INSERT INTO chat_conversations (id, goal, status, created_at, updated_at) VALUES (?, 'g', 'open', ?, ?)`,
        )
        .run(newId(), ts(), ts()),
    ).toThrow(/CHECK/);
    amd(opened, 'text', ['note text']);
    expect(() => amd(opened!, 'text', [null])).toThrow(/CHECK/); // note needs text
    expect(() => amd(opened!, 'text, status', ['t', 'superseded'])).toThrow(/CHECK/);
    expect(() => amd(opened!, 'text, superseded_reason', ['t', 'gone'])).toThrow(/CHECK/);
    amd(opened, 'text, status, superseded_at, superseded_reason', [
      't',
      'needs_reanchor',
      ts(),
      'element_removed',
    ]);
    expect(() => amd(opened!, 'text, status', ['t', 'withdrawn'])).toThrow(/CHECK/);
  });

  it('round-trips (up, down, up)', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0014');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0013');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0012');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0011');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0010');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0009');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0008');
    expect(tables(opened)).not.toContain('chat_conversations');
    expect(tables(opened)).not.toContain('amendments');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0008',
      '0009',
      '0010',
      '0011',
      '0012',
      '0013',
      '0014',
      '0015',
      '0016',
      '0017',
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);
    expect(tables(opened)).toEqual(
      expect.arrayContaining([
        'chat_conversations',
        'chat_messages',
        'workflow_steps',
        'process_scopes',
        'amendments',
      ]),
    );
  });
});

describe('process tables (0005_trace_processes)', () => {
  it('enforces process and step CHECK/UNIQUE constraints (T037)', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { raw } = opened;
    const ts = nowIso();
    const { runId, stateId } = await seedRunAndState(opened, 'p', 'c'.repeat(64));
    const actionId = newId();
    raw
      .prepare(
        `INSERT INTO actions (id, run_id, state_id, role, accessible_name, action_json, safety_class, allowed, skip_reason, created_at)
         VALUES (?, ?, ?, 'button', 'Kup polisę', '{}', 'external-side-effect', 0, 'boundary', ?)`,
      )
      .run(actionId, runId, stateId, ts);
    const insertProcess = (
      id: string,
      run: string,
      status: string,
      outcome: string | null,
      boundary: string | null,
      notObservable: string | null,
    ) =>
      raw
        .prepare(
          `INSERT INTO processes (id, run_id, portal_id, persona_id, name, goal, followup_record_id, status, outcome,
             boundary_action_id, observed_result, not_observable, created_at, ended_at)
           VALUES (?, ?, 'p', 'guest', 'Calc', 'Get a premium', NULL, ?, ?, ?, NULL, ?, ?, NULL)`,
        )
        .run(id, run, status, outcome, boundary, notObservable, ts);
    const pid = newId();
    insertProcess(pid, runId, 'recorded', null, null, null);
    // one process per run
    expect(() => insertProcess(newId(), runId, 'recorded', null, null, null)).toThrow();
    // enums
    expect(() => insertProcess(newId(), newId(), 'weird', null, null, null)).toThrow();
    expect(() => insertProcess(newId(), newId(), 'recorded', 'won', null, null)).toThrow();
    // boundary_reached needs boundary_action_id and not_observable
    expect(() =>
      insertProcess(newId(), newId(), 'recorded', 'boundary_reached', null, 'x'),
    ).toThrow(/CHECK/);
    expect(() =>
      insertProcess(newId(), newId(), 'recorded', 'boundary_reached', actionId, null),
    ).toThrow(/CHECK/);

    const insertStep = (ord: number, kind: string, outcomes: string, ref: string, conf: string) =>
      raw
        .prepare(
          `INSERT INTO process_steps (id, process_id, ord, intent, kind, action_id, transition_id, value, state_before,
             state_after, outcomes_json, evidence_ref, confidence, created_at)
           VALUES (?, ?, ?, 'Open it', ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?)`,
        )
        .run(newId(), pid, ord, kind, stateId, outcomes, ref, conf, ts);
    insertStep(1, 'fill', '[]', 'a.json', 'observed');
    expect(() => insertStep(1, 'click', '[]', 'a.json', 'observed')).toThrow(); // UNIQUE(process_id, ord)
    expect(() => insertStep(2, 'hover', '[]', 'a.json', 'observed')).toThrow();
    expect(() => insertStep(2, 'click', '{}', 'a.json', 'observed')).toThrow();
    expect(() => insertStep(2, 'click', 'nope', 'a.json', 'observed')).toThrow();
    expect(() => insertStep(2, 'click', '[]', '', 'observed')).toThrow();
    expect(() => insertStep(2, 'click', '[]', 'a.json', 'sure')).toThrow();
    expect(() => insertStep(0, 'click', '[]', 'a.json', 'observed')).toThrow();
  });
});

async function seedRunAndState(
  o: OpenedDb,
  portalId: string,
  fingerprint: string,
): Promise<{ runId: string; stateId: string }> {
  const runId = newId();
  const ts = nowIso();
  await o.db
    .insertInto('runs')
    .values({
      id: runId,
      portal_id: portalId,
      persona_id: 'g',
      mode: 'map',
      environment: 'sandbox',
      env_version_or_date: 'd',
      seed_id: null,
      viewport: 'v',
      locale: 'l',
      browser: 'c',
      config_snapshot: '{}',
      status: 'running',
      warning: null,
      steps_used: 0,
      elapsed_ms: 0,
      max_depth_reached: 0,
      started_at: ts,
      ended_at: null,
      coverage: null,
    })
    .execute();
  const stateId = newId();
  await o.db
    .insertInto('states')
    .values({
      id: stateId,
      portal_id: portalId,
      fingerprint,
      cluster_id: 'c',
      route_template: '/',
      title: 't',
      evidence_ref: 'a'.repeat(64) + '.yaml',
      confidence: 'observed',
      stabilization: 'settled',
      first_seen_run: runId,
      created_at: ts,
    })
    .execute();
  return { runId, stateId };
}

describe('portal-scoped states (0002_portal_workspaces, FR-026, FR-027)', () => {
  it('two portals may share a fingerprint; one portal may not duplicate its own', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const fp = 'f'.repeat(64);
    await expect(seedRunAndState(opened, 'portal-a', fp)).resolves.toBeDefined();
    await expect(seedRunAndState(opened, 'portal-b', fp)).resolves.toBeDefined();
    await expect(seedRunAndState(opened, 'portal-a', fp)).rejects.toThrow();
  });

  it('rejects a state with no portal_id', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { runId } = await seedRunAndState(opened, 'portal-a', 'a'.repeat(64));
    await expect(
      opened.db
        .insertInto('states')
        .values({
          id: newId(),
          portal_id: null as unknown as string,
          fingerprint: 'b'.repeat(64),
          cluster_id: 'c',
          route_template: '/',
          title: 't',
          evidence_ref: 'a'.repeat(64) + '.yaml',
          confidence: 'observed',
          stabilization: 'settled',
          first_seen_run: runId,
          created_at: nowIso(),
        })
        .execute(),
    ).rejects.toThrow();
  });
});

describe('connection', () => {
  it('sets WAL, foreign keys and busy_timeout on a file db under data/db', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pf-db-'));
    opened = openDb(dbPathFor(tmp, 'production'));
    expect(opened.raw.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(opened.raw.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(opened.raw.pragma('busy_timeout', { simple: true })).toBe(5000);
  });

  it('rejects unsafe environment names', () => {
    expect(() => dbPathFor('/x', '../evil')).toThrow();
  });

  it('enforces Principle II constraints at the schema level', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { db } = opened;
    const runId = newId();
    const ts = nowIso();
    await db
      .insertInto('runs')
      .values({
        id: runId,
        portal_id: 'p',
        persona_id: 'g',
        mode: 'map',
        environment: 'sandbox',
        env_version_or_date: 'd',
        seed_id: null,
        viewport: '1366x768',
        locale: 'pl-PL',
        browser: 'chromium',
        config_snapshot: '{}',
        status: 'running',
        warning: null,
        steps_used: 0,
        elapsed_ms: 0,
        max_depth_reached: 0,
        started_at: ts,
        ended_at: null,
        coverage: null,
      })
      .execute();
    const state = {
      id: newId(),
      portal_id: 'p',
      fingerprint: 'f'.repeat(64),
      cluster_id: 'c',
      route_template: '/',
      title: 't',
      evidence_ref: 'a'.repeat(64) + '.yaml',
      confidence: 'observed' as const,
      stabilization: 'settled' as const,
      first_seen_run: runId,
      created_at: ts,
    };
    await db.insertInto('states').values(state).execute();
    // empty evidence_ref, unknown confidence and duplicate fingerprint are all rejected
    await expect(
      db
        .insertInto('states')
        .values({ ...state, id: newId(), fingerprint: 'e'.repeat(64), evidence_ref: '' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto('states')
        .values({ ...state, id: newId(), fingerprint: 'd'.repeat(64), confidence: 'sure' as never })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto('states')
        .values({ ...state, id: newId() })
        .execute(),
    ).rejects.toThrow();
    // foreign keys are on
    await expect(
      db
        .insertInto('states')
        .values({ ...state, id: newId(), fingerprint: 'c'.repeat(64), first_seen_run: 'nope' })
        .execute(),
    ).rejects.toThrow();
  });
});

describe('run owner (0009_run_owner)', () => {
  it('round-trips (up, down, up) on a DB holding a run, keeping the run', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { runId } = await seedRunAndState(opened, 'p', 'f'.repeat(64));
    opened.raw
      .prepare(`UPDATE runs SET owner_id = 'server-a', owner_pid = 4242 WHERE id = ?`)
      .run(runId);
    expect(() =>
      opened!.raw.prepare(`UPDATE runs SET owner_pid = 0 WHERE id = ?`).run(runId),
    ).toThrow(/CHECK/);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0014');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0013');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0012');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0011');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0010');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0009');
    const cols = () =>
      (opened!.raw.prepare(`PRAGMA table_info(runs)`).all() as { name: string }[]).map(
        (c) => c.name,
      );
    expect(cols()).not.toContain('owner_id');
    expect(opened.raw.prepare(`SELECT id FROM runs`).all()).toEqual([{ id: runId }]);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0009',
      '0010',
      '0011',
      '0012',
      '0013',
      '0014',
      '0015',
      '0016',
      '0017',
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);
    expect(cols()).toEqual(expect.arrayContaining(['owner_id', 'owner_pid']));
  });
});

// The table is `observations` since 0032 (spec 039 T110); 0012 created it as `page_visits`.
describe('observations (0012_page_visits)', () => {
  const visit = (o: OpenedDb, runId: string, stateId: string, via: string, hops: string) =>
    o.raw
      .prepare(
        `INSERT INTO observations (id, run_id, state_id, transition_id, via, url, hops_json, created_at)
         VALUES (?, ?, ?, NULL, ?, 'http://x/a.do;jsessionid=1?b=2', ?, ?)`,
      )
      .run(newId(), runId, stateId, via, hops, nowIso());

  it('checks via and hops, and round-trips (up, down, up) keeping network calls', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { runId, stateId } = await seedRunAndState(opened, 'p', 'e'.repeat(64));
    visit(opened, runId, stateId, 'navigate', '[{"url":"http://x/","kind":"start"}]');
    expect(() => visit(opened!, runId, stateId, 'teleport', '[]')).toThrow(/CHECK/);
    expect(() => visit(opened!, runId, stateId, 'action', '{}')).toThrow(/CHECK/);
    opened.raw
      .prepare(
        `INSERT INTO network_calls (id, run_id, transition_id, method, url_template, status, req_schema, res_schema, created_at, url)
         VALUES (?, ?, NULL, 'GET', '/api/x', 200, '{}', '{}', ?, 'http://x/api/x?q=1')`,
      )
      .run(newId(), runId, nowIso());
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0014');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0013');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0012');
    expect(tables(opened)).not.toContain('page_visits');
    expect(opened.raw.prepare('SELECT url_template FROM network_calls').all()).toEqual([
      { url_template: '/api/x' },
    ]);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0012',
      '0013',
      '0014',
      '0015',
      '0016',
      '0017',
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);
    expect(opened.raw.prepare('SELECT url FROM network_calls').all()).toEqual([{ url: null }]);
  });
});

describe('screens and amendment revisions (0015, 0016; spec 022)', () => {
  const insertState = (o: OpenedDb, runId: string, n: number, route: string, cluster: string) => {
    const id = newId();
    o.raw
      .prepare(
        `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence,
                             stabilization, first_seen_run, created_at)
         VALUES (?, 'p', ?, ?, ?, ?, ?, 'observed', 'settled', ?, ?)`,
      )
      .run(
        id,
        String(n).repeat(64),
        cluster,
        route,
        `title ${n}`,
        'a'.repeat(64) + '.yaml',
        runId,
        `2030-01-0${n}T00:00:00.000Z`,
      );
    return id;
  };
  const insertAmendment = (
    o: OpenedDb,
    key: string,
    status: string,
    stateId: string,
    runId: string,
  ) =>
    o.raw
      .prepare(
        `INSERT INTO amendments (id, key, portal_id, target_kind, target_id, kind, text, author, status,
                                 superseded_by_run, superseded_reason, superseded_detail, superseded_at, created_at)
         VALUES (?, ?, 'p', 'state', ?, 'note', 't', 'ba', ?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z')`,
      )
      .run(
        newId(),
        key,
        stateId,
        status,
        status === 'superseded' ? runId : null,
        status === 'superseded' ? 'element_removed' : null,
        status === 'superseded' ? 'link gone' : null,
        status === 'superseded' ? '2026-01-05T00:00:00.000Z' : null,
      );

  it('backfills screens, revision numbers, amendment heads and revisions; down restores the 0014 shape', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    const { runId, stateId: first } = await seedRunAndState(opened, 'p', 'e'.repeat(64));
    const second = insertState(opened, runId, 1, '/', 'c'); // same screen as `first`, later
    const other = insertState(opened, runId, 2, '/login', 'c');
    insertAmendment(opened, 'AMD-001', 'active', first, runId);
    insertAmendment(opened, 'AMD-002', 'superseded', other, runId);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0015',
      '0016',
      '0017',
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);

    const screens = opened.raw.prepare('SELECT * FROM screens ORDER BY route_template').all() as {
      id: string;
      route_template: string;
      title: string;
    }[];
    expect(screens.map((s) => s.route_template)).toEqual(['/', '/login']);
    expect(screens[0]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const revOf = (id: string) =>
      opened!.raw.prepare('SELECT screen_id, screen_rev FROM states WHERE id = ?').get(id) as {
        screen_id: string;
        screen_rev: number;
      };
    expect([revOf(first).screen_rev, revOf(second).screen_rev, revOf(other).screen_rev]).toEqual([
      1, 2, 1,
    ]);
    expect(revOf(first).screen_id).toBe(revOf(second).screen_id);
    expect(screens[0]!.title).toBe('title 1'); // latest revision (the second state)

    const heads = opened.raw
      .prepare('SELECT key, status, rev, screen_id FROM amendments ORDER BY key')
      .all() as { key: string; status: string; rev: number; screen_id: string }[];
    expect(heads.map((h) => [h.key, h.status, h.rev])).toEqual([
      ['AMD-001', 'active', 1],
      ['AMD-002', 'needs_reanchor', 2],
    ]);
    expect(heads[1]!.screen_id).toBe(revOf(other).screen_id);
    const revs = opened.raw
      .prepare(
        `SELECT a.key, r.rev, r.base_rev, r.change, r.status, r.reason FROM amendment_revisions r
         JOIN amendments a ON a.id = r.amendment_id ORDER BY a.key, r.rev`,
      )
      .all();
    expect(revs).toEqual([
      { key: 'AMD-001', rev: 1, base_rev: null, change: 'create', status: 'active', reason: null },
      { key: 'AMD-002', rev: 1, base_rev: null, change: 'create', status: 'active', reason: null },
      {
        key: 'AMD-002',
        rev: 2,
        base_rev: 1,
        change: 'needs_reanchor',
        status: 'needs_reanchor',
        reason: 'element_removed: link gone',
      },
    ]);
    expect(opened.raw.pragma('foreign_key_check')).toEqual([]);

    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0016');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0015');
    const back = opened.raw
      .prepare('SELECT status, superseded_reason FROM amendments ORDER BY key')
      .all();
    expect(back).toEqual([
      { status: 'active', superseded_reason: null },
      { status: 'superseded', superseded_reason: 'element_removed' },
    ]);
    expect(opened.raw.prepare('SELECT count(*) AS n FROM states').get()).toEqual({ n: 3 });
  });

  it('refuses a revision without a base after r1, a second r1, or an unknown change', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const { stateId } = await seedRunAndState(opened, 'p', 'f'.repeat(64));
    // 0041: an amendment and its revisions cite their state through a ref.
    opened.raw.prepare(`INSERT INTO entity_refs (id, state_id) VALUES ('ref-s', ?)`).run(stateId);
    const aid = newId();
    opened.raw
      .prepare(
        `INSERT INTO amendments (id, key, portal_id, ref_id, kind, text, author, created_at)
         VALUES (?, 'AMD-001', 'p', 'ref-s', 'note', 't', 'ba', ?)`,
      )
      .run(aid, nowIso());
    const add = (rev: number, base: number | null, change: string, status = 'active') =>
      opened!.raw
        .prepare(
          `INSERT INTO amendment_revisions (amendment_id, rev, base_rev, change, author, status, ref_id, created_at)
           VALUES (?, ?, ?, ?, 'ba', ?, 'ref-s', ?)`,
        )
        .run(aid, rev, base, change, status, nowIso());
    add(1, null, 'create');
    expect(() => add(1, null, 'create')).toThrow(/UNIQUE|PRIMARY/);
    expect(() => add(2, null, 'edit')).toThrow(/CHECK/);
    expect(() => add(2, 1, 'supersede')).toThrow(/CHECK/);
    expect(() => add(2, 1, 'edit', 'superseded')).toThrow(/CHECK/);
    add(2, 1, 'carry_forward');
  });
});

describe('chat proposals (0017; spec 022)', () => {
  it('enforces the amendment, applied and decided CHECKs, keeps both indexes, and the down drops the table', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const now = nowIso();
    opened.raw
      .prepare(
        `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES ('c1', 'p', 'g', ?, ?)`,
      )
      .run(now, now);
    opened.raw.prepare(`INSERT INTO entity_refs (id, evidence_file) VALUES ('r1', 'e.png')`).run();
    opened.raw
      .prepare(
        `INSERT INTO amendments (id, key, portal_id, ref_id, kind, text, author, created_at)
         VALUES ('a1', 'AMD-001', 'p', 'r1', 'note', 't', 'ba', ?)`,
      )
      .run(now);
    // 0041: `amendment_id` names the amendment a proposal changes; NULL is a new amendment.
    const add = (
      amendmentId: string | null,
      baseRev: number | null,
      payload: string,
      status = 'open',
      applied: [string | null, number | null] = [null, null],
      decidedAt: string | null = null,
      summary = 'one line',
    ) =>
      opened!.raw
        .prepare(
          `INSERT INTO chat_proposals (id, conversation_id, portal_id, amendment_id, base_rev, payload, summary, status, applied_amendment_id, applied_rev, decided_at, created_at)
           VALUES (lower(hex(randomblob(8))), 'c1', 'p', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          amendmentId,
          baseRev,
          payload,
          summary,
          status,
          applied[0],
          applied[1],
          decidedAt,
          now,
        );
    add('a1', 1, '{"text":"x"}');
    add(null, null, '{"text":"x"}');
    expect(() => add('a1', null, '{}')).toThrow(/CHECK/);
    expect(() => add(null, 1, '{}')).toThrow(/CHECK/);
    expect(() => add('nope', 1, '{}')).toThrow(/FOREIGN KEY/);
    expect(() => add(null, null, '[]')).toThrow(/CHECK/);
    expect(() => add(null, null, 'nope')).toThrow(/CHECK/);
    expect(() => add(null, null, '{}', 'open', [null, null], null, '')).toThrow(/CHECK/);
    expect(() => add(null, null, '{}', 'applied', [null, null], now)).toThrow(/CHECK/);
    expect(() => add(null, null, '{}', 'discarded')).toThrow(/CHECK/);
    expect(() => add(null, null, '{}', 'stale')).toThrow(/CHECK/);
    expect(() => add(null, null, '{}', 'bogus')).toThrow(/CHECK/);
    add(null, null, '{}', 'discarded', [null, null], now);
    expect(
      (
        opened.raw
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chat_proposals'",
          )
          .all() as { name: string }[]
      )
        .map((r) => r.name)
        .filter((n) => n.startsWith('ix_'))
        .sort(),
    ).toEqual(['ix_chat_proposals_conversation', 'ix_chat_proposals_portal_status']);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0017');
    expect(tables(opened)).not.toContain('chat_proposals');
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0017',
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);
  });
});

describe('BA processes (0018; spec 022 M5)', () => {
  const insertState = (o: OpenedDb, runId: string, n: number, route: string, title: string) => {
    const id = newId();
    o.raw
      .prepare(
        `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence,
                             stabilization, first_seen_run, created_at)
         VALUES (?, 'p', ?, 'c', ?, ?, ?, 'observed', 'settled', ?, '2030-01-01T00:00:00.000Z')`,
      )
      .run(id, String(n).repeat(64), route, title, 'a'.repeat(64) + '.yaml', runId);
    return id;
  };
  const insertScope = (
    o: OpenedDb,
    name: string,
    start: string,
    end: string,
    selected: string[],
    createdAt: string,
    portal = 'p',
  ) => {
    const now = nowIso();
    o.raw
      .prepare(
        `INSERT OR IGNORE INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES ('c1', ?, 'g', ?, ?)`,
      )
      .run(portal, now, now);
    const id = newId();
    o.raw
      .prepare(
        `INSERT INTO process_scopes (id, conversation_id, portal_id, process_name, persona, start_state_id, end_state_id,
                                     selected_state_ids, source, created_at)
         VALUES (?, 'c1', ?, ?, 'anon', ?, ?, ?, 'ba_description', ?)`,
      )
      .run(id, portal, name, start, end, JSON.stringify(selected), createdAt);
    return id;
  };

  it('backfills the newest scope per name with ordered steps; down drops the tables', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    const { runId, stateId: start } = await seedRunAndState(opened, 'p', 'e'.repeat(64));
    const end = insertState(opened, runId, 1, '/done', 'Done');
    const zed = insertState(opened, runId, 2, '/z-page', 'Z page');
    const mid = insertState(opened, runId, 3, '/a-page', 'A page');
    insertScope(opened, 'Claim', start, end, [zed], '2030-02-01T00:00:00.000Z'); // older, ignored
    const newest = insertScope(
      opened,
      'Claim',
      start,
      end,
      [zed, mid, start, end],
      '2030-03-01T00:00:00.000Z',
    );
    insertScope(opened, 'Apply', start, end, [], '2030-01-15T00:00:00.000Z');
    opened.raw
      .prepare(
        `INSERT INTO screens (id, portal_id, route_template, cluster_id, title, first_seen_run, created_at)
         VALUES ('scr1', 'p', '/a-page', 'c', 'A page', ?, '2030-01-01T00:00:00.000Z')`,
      )
      .run(runId);
    opened.raw
      .prepare(`UPDATE states SET screen_id = 'scr1', screen_rev = 1 WHERE id = ?`)
      .run(mid);
    expect(migrateUp(opened.raw, MIGRATIONS)).toEqual([
      '0018',
      '0019',
      '0020',
      '0021',
      '0022',
      '0023',
      '0024',
      '0025',
      '0026',
      '0027',
      '0028',
      '0029',
      '0030',
      '0031',
      '0032',
      '0033',
      '0034',
      '0035',
      '0036',
      '0037',
      '0038',
      '0039',
      '0040',
      '0041',
      '0042',
      '0043',
      '0044',
      '0045',
      '0046',
      '0047',
      '0048',
      '0049',
      '0050',
      '0051',
    ]);

    const procs = opened.raw
      .prepare(
        'SELECT id, key, name, persona, stage, rev, source, scope_id, suggestion_id, created_at, updated_at FROM ba_processes ORDER BY key',
      )
      .all() as Record<string, unknown>[];
    expect(procs.map((p) => [p.key, p.name, p.stage, p.rev, p.source])).toEqual([
      ['PRC-001', 'Apply', 'scoped', 1, 'scope'],
      ['PRC-002', 'Claim', 'scoped', 1, 'scope'],
    ]);
    expect(procs[1]).toMatchObject({
      scope_id: newest,
      suggestion_id: null,
      persona: 'anon',
      created_at: '2030-03-01T00:00:00.000Z',
      updated_at: '2030-03-01T00:00:00.000Z',
    });
    expect(procs[1]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(opened.raw.prepare('SELECT count(*) AS n FROM process_scopes').get()).toEqual({ n: 3 });
    expect(
      opened.raw
        .prepare(
          'SELECT rev, base_rev, change, author, name, stage FROM ba_process_revisions WHERE process_id = ?',
        )
        .all(procs[1]!.id),
    ).toEqual([
      { rev: 1, base_rev: null, change: 'create', author: 'BA', name: 'Claim', stage: 'scoped' },
    ]);

    const variants = opened.raw
      .prepare(
        'SELECT id, label, kind, rev, branched_from_model_id FROM process_models WHERE process_id = ?',
      )
      .all(procs[1]!.id) as { id: string; label: string; kind: string; rev: number }[];
    expect(variants).toMatchObject([
      { label: 'A', kind: 'as_is', rev: 1, branched_from_model_id: null },
    ]);
    const rev = opened.raw
      .prepare(
        'SELECT base_rev, change, author, steps, created_at FROM process_model_revisions WHERE model_id = ? AND rev = 1',
      )
      .get(variants[0]!.id) as {
      base_rev: null;
      change: string;
      author: string;
      steps: string;
      created_at: string;
    };
    expect([rev.base_rev, rev.change, rev.author, rev.created_at]).toEqual([
      null,
      'create',
      'BA',
      '2030-03-01T00:00:00.000Z',
    ]);
    const steps = JSON.parse(rev.steps) as Record<string, unknown>[];
    // start, the selected states by route_template (start and end excluded), end
    expect(steps.map((s) => [s.id, s.route, s.state_id])).toEqual([
      ['s1', '/', start],
      ['s2', '/a-page', mid],
      ['s3', '/z-page', zed],
      ['s4', '/done', end],
    ]);
    expect(steps[1]).toEqual({
      id: 's2',
      title: 'A page',
      route: '/a-page',
      state_id: mid,
      screen_id: 'scr1',
      observed: true,
      from: [],
      annotations: [],
    });
    expect(opened.raw.pragma('foreign_key_check')).toEqual([]);
    expect(tables(opened)).not.toContain('_scope_backfill');

    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0018');
    for (const t of [
      'ba_processes',
      'process_variants',
      'grouping_suggestions',
      'change_spec_revisions',
    ])
      expect(tables(opened)).not.toContain(t);
    expect(opened.raw.prepare('SELECT count(*) AS n FROM process_scopes').get()).toEqual({ n: 3 });
  });

  it('enforces the revision, enum and JSON CHECKs and the named indexes', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const now = nowIso();
    const run = (sql: string, ...args: unknown[]) => opened!.raw.prepare(sql).run(...args);
    run(
      `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, created_at, updated_at)
       VALUES ('pr1', 'p', 'PRC-001', 'N', 'anon', 'scoped', 1, 'new', ?, ?)`,
      now,
      now,
    );
    const proc = (key: string, stage = 'scoped', source = 'new') =>
      run(
        `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, created_at, updated_at)
         VALUES (lower(hex(randomblob(8))), 'p', ?, 'N', 'anon', ?, 1, ?, ?, ?)`,
        key,
        stage,
        source,
        now,
        now,
      );
    expect(() => proc('PRC-001')).toThrow(/UNIQUE/);
    expect(() => proc('X-2')).toThrow(/CHECK/);
    expect(() => proc('PRC-002', 'bogus')).toThrow(/CHECK/);
    expect(() => proc('PRC-003', 'scoped', 'bogus')).toThrow(/CHECK/);

    const prRev = (rev: number, base: number | null, change = 'create') =>
      run(
        `INSERT INTO ba_process_revisions (process_id, rev, base_rev, change, author, name, stage, created_at)
         VALUES ('pr1', ?, ?, ?, 'ba', 'N', 'scoped', ?)`,
        rev,
        base,
        change,
        now,
      );
    prRev(1, null);
    expect(() => prRev(2, null, 'rename')).toThrow(/CHECK/);
    expect(() => prRev(1, 1)).toThrow(/CHECK/);
    expect(() => prRev(2, 1, 'bogus')).toThrow(/CHECK/);
    prRev(2, 1, 'stage');

    run(
      `INSERT INTO process_models (id, process_id, label, kind, rev, created_at) VALUES ('v1', 'pr1', 'A', 'as_is', 1, ?)`,
      now,
    );
    expect(() =>
      run(
        `INSERT INTO process_models (id, process_id, label, kind, rev, created_at) VALUES ('v2', 'pr1', 'A', 'to_be', 1, ?)`,
        now,
      ),
    ).toThrow(/UNIQUE/);
    expect(() =>
      run(
        `INSERT INTO process_models (id, process_id, label, kind, rev, branched_from_model_id, created_at) VALUES ('v2', 'pr1', 'B', 'to_be', 1, 'v1', ?)`,
        now,
      ),
    ).toThrow(/CHECK/);
    const vRev = (rev: number, base: number | null, steps: string, change = 'create') =>
      run(
        `INSERT INTO process_model_revisions (model_id, rev, base_rev, change, author, steps, created_at)
         VALUES ('v1', ?, ?, ?, 'ba', ?, ?)`,
        rev,
        base,
        change,
        steps,
        now,
      );
    expect(() => vRev(1, null, '{}')).toThrow(/CHECK/);
    expect(() => vRev(1, null, 'nope')).toThrow(/CHECK/);
    expect(() => vRev(2, null, '[]')).toThrow(/CHECK/);
    expect(() => vRev(1, null, '[]', 'bogus')).toThrow(/CHECK/);
    vRev(1, null, '[]');
    vRev(2, 1, '[]', 'save');

    const draft = (steps: string) =>
      run(
        `INSERT INTO process_drafts (model_id, author, base_rev, steps, updated_at) VALUES ('v1', 'ba', 1, ?, ?)`,
        steps,
        now,
      );
    expect(() => draft('{}')).toThrow(/CHECK/);
    draft('[]');
    expect(() => draft('[]')).toThrow(/UNIQUE|PRIMARY/);

    const live = (env: string, rev = 1) =>
      run(
        `INSERT INTO process_live (id, process_id, environment, model_id, model_rev, author, created_at)
         VALUES (lower(hex(randomblob(8))), 'pr1', ?, 'v1', ?, 'ba', ?)`,
        env,
        rev,
        now,
      );
    live('sandbox');
    // Free names since 0021 (spec 030 R-61); a malformed one is still refused.
    live('moon');
    expect(() => live('Moon')).toThrow(/CHECK/);
    opened.raw.pragma('foreign_keys = ON');
    expect(() => live('staging', 9)).toThrow(/FOREIGN KEY/);

    const sugg = (
      status: string,
      steps = '[]',
      process: string | null = null,
      decided: string | null = null,
    ) =>
      run(
        `INSERT INTO grouping_suggestions (id, portal_id, name, persona, steps, why, screens_key, status, process_id, decided_at, created_at)
         VALUES (lower(hex(randomblob(8))), 'p', 'N', 'anon', ?, 'why', 'a,b', ?, ?, ?, ?)`,
        steps,
        status,
        process,
        decided,
        now,
      );
    sugg('open');
    expect(() => sugg('open', '{}')).toThrow(/CHECK/);
    expect(() => sugg('dismissed')).toThrow(/CHECK/);
    expect(() => sugg('accepted', '[]', null, now)).toThrow(/CHECK/);
    sugg('accepted', '[]', 'pr1', now);

    const spec = (rev: number, base: number | null, sections: string) =>
      run(
        `INSERT INTO change_spec_revisions (process_id, rev, base_rev, left_model_id, left_rev, right_model_id, right_rev, sections, author, created_at)
         VALUES ('pr1', ?, ?, 'v1', 1, 'v1', 2, ?, 'ba', ?)`,
        rev,
        base,
        sections,
        now,
      );
    expect(() => spec(1, null, '[]')).toThrow(/CHECK/);
    expect(() => spec(2, null, '{}')).toThrow(/CHECK/);
    spec(1, null, '{}');

    const indexes = (
      opened.raw
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%' AND tbl_name IN
         ('ba_processes','ba_process_revisions','process_models','process_model_revisions','process_drafts','process_live','grouping_suggestions','change_spec_revisions')`,
        )
        .all() as { name: string }[]
    )
      .map((r) => r.name)
      .sort();
    expect(indexes).toEqual([
      'ix_grouping_suggestions_portal_screens',
      'ix_grouping_suggestions_portal_status',
      'ix_process_live_process_env',
    ]);
  });
});
