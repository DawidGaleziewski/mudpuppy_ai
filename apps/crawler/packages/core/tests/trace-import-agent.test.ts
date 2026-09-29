import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dbPathFor, openDb } from '../src/db.js';
import { importAgent } from '../src/trace/import-agent.js';
import { migrateUp } from '../src/migrate.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
const AGENT_ID = 'agent-test-0001';
const RUN = 'run-1';

const transcriptPath = fileURLToPath(new URL('./fixtures/crawler-transcript.jsonl', import.meta.url));

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'pf-import-agent-'));
  mkdirSync(join(dataDir, 'db'), { recursive: true });
  const opened = openDb(dbPathFor(dataDir, 'sandbox'));
  migrateUp(opened.raw, MIGRATIONS);
  opened.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, seed_id,
       viewport, locale, browser, config_snapshot, status, warning, steps_used, elapsed_ms,
       max_depth_reached, started_at, ended_at, coverage)
       VALUES (?, 'test-portal', 'guest', 'map', 'sandbox', '2026-01-15', NULL, '1280x800', 'pl-PL',
       'chromium', '{}', 'completed', NULL, 4, 0, 0, '2026-01-15T10:00:00.000Z', NULL, NULL)`,
    )
    .run(RUN);
  opened.raw.prepare(`INSERT INTO trace_boots (id, started_at, environment, server, pid, version,
       trace_level, pw_trace) VALUES ('boot-1', '2026-01-15T10:00:00.000Z', 'sandbox', 'pathfinder',
       1, '0.0.0', 'standard', 'non_production')`).run();
  const insertSpan = opened.raw.prepare(
    `INSERT INTO trace_spans (id, boot_id, seq, run_id, kind, name, status, started_at, ended_at,
      duration_ms, summary, tool_use_id, agent_id)
     VALUES (?, 'boot-1', ?, ?, 'call', ?, 'ok', '2026-01-15T10:00:00.000Z', '2026-01-15T10:00:00.100Z',
      10, '', ?, ?)`,
  );
  insertSpan.run('span-1', 1, RUN, 'start_run', 'toolu_test_001', AGENT_ID);
  insertSpan.run('span-2', 2, RUN, 'navigate', 'toolu_test_002', AGENT_ID);
  insertSpan.run('span-3', 3, RUN, 'get_known_states', 'toolu_test_003', AGENT_ID);
  insertSpan.run('span-4', 4, RUN, 'act', 'toolu_test_004', AGENT_ID);
  opened.raw.close();
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function rows(): Record<string, unknown>[] {
  const opened = openDb(dbPathFor(dataDir, 'sandbox'));
  const out = opened.raw
    .prepare('SELECT * FROM agent_turns ORDER BY message_uuid, block_index')
    .all() as Record<string, unknown>[];
  opened.raw.close();
  return out;
}

describe('importAgent', () => {
  it('imports the transcript into the matching store', async () => {
    const result = await importAgent({ transcriptPath, dataDir });
    expect(result.agent_id).toBe(AGENT_ID);
    expect(result.stores).toHaveLength(1);
    expect(result.stores[0]).toMatchObject({ env: 'sandbox', run_ids: [RUN], matched: 4 });

    const stored = rows();
    expect(stored.length).toBe(result.stores[0]!.turns);
    expect(stored.every((r) => r.imported_at)).toBe(true);
    const toolUse = stored.find((r) => r.tool_use_id === 'toolu_test_001');
    expect(toolUse?.matched).toBe(1);
    expect(toolUse?.run_id).toBe(RUN);
  });

  it('masks stored text (no scrubber-corpus value survives)', async () => {
    await importAgent({ transcriptPath, dataDir });
    const text = rows()
      .map((r) => r.text)
      .filter((t): t is string => typeof t === 'string')
      .join('\n');
    expect(text).not.toContain('test.user@example.test');
  });

  it('re-importing the same transcript is idempotent: same ids, same content', async () => {
    await importAgent({ transcriptPath, dataDir });
    const first = rows();

    const second = await importAgent({ transcriptPath, dataDir });
    const after = rows();

    const withoutImportedAt = (rs: Record<string, unknown>[]) =>
      rs.map((r) => {
        const copy = { ...r };
        delete copy.imported_at;
        return copy;
      });

    expect(second.stores[0]!.turns).toBe(first.length);
    expect(after.length).toBe(first.length);
    expect(after.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(withoutImportedAt(after)).toEqual(withoutImportedAt(first));
  });

  it('a longer (resumed) transcript adds rows without disturbing existing ones', async () => {
    await importAgent({ transcriptPath, dataDir });
    const first = rows();

    const resumedDir = mkdtempSync(join(tmpdir(), 'pf-import-agent-resumed-'));
    const extraLine = JSON.stringify({
      parentUuid: 'u-0014',
      isSidechain: true,
      agentId: AGENT_ID,
      sessionId: 'session-test-0001',
      type: 'user',
      message: { role: 'user', content: 'continue' },
      uuid: 'u-0015',
      timestamp: '2026-01-15T10:01:00.000Z',
    });
    const resumedPath = join(resumedDir, 'resumed.jsonl');
    const base = readFileSync(transcriptPath, 'utf8').trimEnd();
    writeFileSync(resumedPath, `${base}\n${extraLine}\n`);

    const second = await importAgent({ transcriptPath: resumedPath, dataDir });
    const after = rows();
    expect(after.length).toBe(first.length + 1);
    expect(after.slice(0, first.length).map((r) => r.id)).toEqual(first.map((r) => r.id));
    rmSync(resumedDir, { recursive: true, force: true });
    void second;
  });

  it('skips a store with no matching tool_use_id or agent_id', async () => {
    const opened = openDb(dbPathFor(dataDir, 'other'));
    migrateUp(opened.raw, MIGRATIONS);
    opened.raw.close();

    const result = await importAgent({ transcriptPath, dataDir });
    expect(result.stores.map((s) => s.env)).toEqual(['sandbox']);
  });

  it('reports skipped for an unreadable transcript', async () => {
    const result = await importAgent({ transcriptPath: join(dataDir, 'nope.jsonl'), dataDir });
    expect(result.stores).toEqual([]);
    expect(result.skipped).toBeTruthy();
  });
});
