import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { migrateDown, migrateUp, openDb, type OpenedDb } from '../src/index.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));

let o: OpenedDb | undefined;
afterEach(async () => {
  await o?.close();
  o = undefined;
});

const ts = '2026-10-22T10:00:00.000Z';

it('0049 workbench: kind defaults to chat, CHECKs hold, one view per turn, down drops it all', () => {
  o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  const run = (sql: string, ...p: unknown[]) => o!.raw.prepare(sql).run(...p);
  run(
    `INSERT INTO chat_conversations (id, goal, created_at, updated_at) VALUES ('c1','g',?,?)`,
    ts,
    ts,
  );
  const kind = () =>
    (
      o!.raw.prepare(`SELECT kind FROM chat_conversations WHERE id = 'c1'`).get() as {
        kind: string;
      }
    ).kind;
  expect(kind()).toBe('chat');
  expect(() => run(`UPDATE chat_conversations SET kind = 'other' WHERE id = 'c1'`)).toThrow(
    /CHECK/,
  );

  run(`INSERT INTO workbench_conversations (conversation_id, updated_at) VALUES ('c1', ?)`, ts);
  const wc = o.raw.prepare('SELECT path, path_source, title FROM workbench_conversations').get();
  expect(wc).toEqual({ path: 'chat', path_source: 'assistant', title: null });

  const view = (id: string, turn: number, why = 'because') =>
    run(
      `INSERT INTO workbench_views (id, conversation_id, turn, path, why, spec_json, received_json, created_at)
       VALUES (?, 'c1', ?, 'mapping', ?, '{}', '[]', ?)`,
      id,
      turn,
      why,
      ts,
    );
  view('v1', 1);
  expect(() => view('v2', 1)).toThrow(/UNIQUE/);
  expect(() => view('v3', 0)).toThrow(/CHECK/);
  expect(() => view('v4', 2, '')).toThrow(/CHECK/);

  const command = (id: string, state: string, extra = '') =>
    run(
      `INSERT INTO workbench_commands (id, conversation_id, turn, command, args_json, reason, source, state,
         token_hash, precondition_hash, idempotency_key, expires_at, created_at, updated_at ${extra ? ', ' + extra.split('|')[0] : ''})
       VALUES (?, 'c1', 1, 'scan.start', '{}', 'r', 'button', ?, ?, 'p', ?, ?, ?, ? ${extra ? ', ' + extra.split('|')[1] : ''})`,
      id,
      state,
      'a'.repeat(64),
      `key-${id}`,
      ts,
      ts,
      ts,
    );
  command('k1', 'proposed');
  command('k2', 'expired');
  expect(() => command('k3', 'running')).toThrow(/CHECK/); // nothing runs before Confirm
  expect(() => command('k4', 'done', `confirmed_by, confirmed_at|'BA', '${ts}'`)).toThrow(/CHECK/);
  expect(() => command('k5', 'failed', `confirmed_by, confirmed_at|'BA', '${ts}'`)).toThrow(
    /CHECK/,
  );
  command('k6', 'done', `confirmed_by, confirmed_at, result_json|'BA', '${ts}', '{"run_id":"r1"}'`);
  expect(() => run(`UPDATE workbench_commands SET token_hash = 'short' WHERE id = 'k1'`)).toThrow(
    /CHECK/,
  );
  expect(() =>
    run(`UPDATE workbench_commands SET idempotency_key = 'key-k2' WHERE id = 'k1'`),
  ).toThrow(/UNIQUE/);

  const feedback = (value: string, by = 'BA') =>
    run(
      `INSERT INTO workbench_feedback (view_id, by, value, created_at, updated_at) VALUES ('v1', ?, ?, ?, ?)`,
      by,
      value,
      ts,
      ts,
    );
  feedback('yes');
  expect(() => feedback('no')).toThrow(/UNIQUE|PRIMARY/); // one answer per view per person
  expect(() => feedback('maybe', 'QA')).toThrow(/CHECK/);
  expect(() => feedback('no', '')).toThrow(/CHECK/);
  expect(() =>
    run(
      `INSERT INTO workbench_feedback (view_id, by, value, created_at, updated_at) VALUES ('nope','BA','yes',?,?)`,
      ts,
      ts,
    ),
  ).toThrow(/FOREIGN/);

  expect(
    o.raw
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='workbench_commands' AND name LIKE 'ix_%'`,
      )
      .all(),
  ).toEqual([{ name: 'ix_workbench_commands_conversation' }]);

  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0053');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0051');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0050');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0049');
  const tables = o.raw.prepare(`SELECT name FROM sqlite_master WHERE name LIKE 'workbench%'`).all();
  expect(tables).toEqual([]);
  const cols = o.raw.prepare('PRAGMA table_info(chat_conversations)').all() as { name: string }[];
  expect(cols.map((c) => c.name)).not.toContain('kind');
  expect(o.raw.prepare('SELECT id FROM chat_conversations').all()).toEqual([{ id: 'c1' }]);
  migrateUp(o.raw, MIGRATIONS);
  expect(kind()).toBe('chat');
});
