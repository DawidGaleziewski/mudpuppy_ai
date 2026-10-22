import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateUp, openDb } from '@mudpuppy/store';
import { MIGRATIONS } from '../../tests/helpers.js';
import { newestWorkspace, parseConfig, REPO_ROOT } from '../config.js';
import { cliArgs, classifyOutcome, createWorkspace, GROUPING_TOOLS } from '../harness/index.js';
import { openSuggestions } from '../queries.js';
import { regroupPrompt } from '../prompts.js';
import { loadProcesses, taskFor } from '../tasks.js';

const made: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'grouping-eval-test-'));
  made.push(d);
  return d;
};
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('parseConfig', () => {
  it('takes the newest crawler-eval workspace of the portal, and refuses unknown flags', () => {
    const t = temp();
    for (const [name, at] of [
      ['pf-eval-reference-insurer-old', 1],
      ['pf-eval-reference-insurer-new', 2],
      ['pf-eval-other-x', 3],
    ] as const) {
      mkdirSync(join(t, name));
      utimesSync(join(t, name), at, at);
    }
    expect(newestWorkspace(t, 'reference-insurer')).toBe(join(t, 'pf-eval-reference-insurer-new'));
    const r = parseConfig(['reference-insurer'], REPO_ROOT, t);
    expect(r.ok && r.config.store).toBe(join(t, 'pf-eval-reference-insurer-new'));
    expect(r.ok && r.config.resultsDir).toMatch(/data\/evals\/grouping-reference-insurer$/);
    expect(parseConfig(['reference-insurer', '--nope'], REPO_ROOT, t).ok).toBe(false);
    expect(parseConfig(['reference-insurer', '--budget-usd', 'lots'], REPO_ROOT, t).ok).toBe(false);
    expect(parseConfig(['other-portal'], REPO_ROOT, temp()).ok).toBe(false);
  });
});

describe('the task', () => {
  it("cuts each ground-truth process at its last observable route", () => {
    const p = loadProcesses(REPO_ROOT, taskFor('reference-insurer')!);
    const p01 = p.find((x) => x.id === 'P01')!;
    expect(p01.observable.at(-1)).toBe('/kalkulator/wynik');
    expect(p01.observable).not.toContain('/kalkulator/zakup');
  });
});

describe('createWorkspace', () => {
  it('copies the store without any grouping, adds a conversation, and leaves the source alone', () => {
    const src = temp();
    const store = openDb(join(src, 'data', 'db', 'sandbox.sqlite'));
    migrateUp(store.raw, MIGRATIONS);
    store.raw
      .prepare(
        `INSERT INTO grouping_suggestions (id, portal_id, name, persona, steps, why, screens_key, status,
           conversation_id, process_id, decided_by, decided_at, created_at)
         VALUES ('g1', 'reference-insurer', 'Old cut', 'guest', '[]', 'earlier', 'k', 'open',
           NULL, NULL, NULL, NULL, '2026-10-18T00:00:00Z')`,
      )
      .run();
    // A documented process: its PROC record names it (spec 039 T070), yet the process goes.
    store.raw
      .prepare(
        `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, created_at, updated_at, record_key)
         VALUES ('p-1', 'reference-insurer', 'PRC-001', 'Quote', 'guest', 'scoped', 1, 'new', '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z', 'PROC-001')`,
      )
      .run();
    store.raw
      .prepare(
        `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn, created_at, updated_at, process_id)
         VALUES ('r-1', 'reference-insurer', 'process', 'PROC-001', 1, 'Quote', 1, NULL, 0, '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z', 'p-1')`,
      )
      .run();
    store.raw.close();
    const parsed = parseConfig(['reference-insurer', '--store', src]);
    if (!parsed.ok) throw new Error(parsed.error);
    const ws = createWorkspace(parsed.config);
    made.push(ws.dir);
    const copy = openDb(ws.storePath);
    expect(copy.raw.prepare('SELECT count(*) AS n FROM grouping_suggestions').get()).toEqual({ n: 0 });
    expect(copy.raw.prepare('SELECT count(*) AS n FROM ba_processes').get()).toEqual({ n: 0 });
    expect(copy.raw.prepare('SELECT portal_id FROM chat_conversations WHERE id = ?').get(ws.conversationId)).toEqual({
      portal_id: 'reference-insurer',
    });
    expect(openSuggestions(copy.raw, 'reference-insurer')).toEqual([]);
    copy.raw.close();
    const again = openDb(join(src, 'data', 'db', 'sandbox.sqlite'));
    expect(again.raw.prepare('SELECT count(*) AS n FROM grouping_suggestions').get()).toEqual({ n: 1 });
    again.raw.close();
    const mcp = JSON.parse(readFileSync(join(ws.dir, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { env: Record<string, string> }>;
    };
    expect(Object.keys(mcp.mcpServers)).toEqual(['mudpuppy-chat']);
    expect(mcp.mcpServers['mudpuppy-chat']!.env.MUDPUPPY_ROOT).toBe(ws.dir);

    // Only the two grouping tools, the orchestrator's own prompt, the chat's handover shape.
    const args = cliArgs(parsed.config, ws, regroupPrompt('reference-insurer'), 'sid');
    expect(args[args.indexOf('--allowedTools') + 1]).toBe(GROUPING_TOOLS.join(','));
    expect(args[args.indexOf('--disallowedTools') + 1]).toContain('Read');
    expect(args[args.indexOf('--system-prompt') + 1]).toContain('suggest_grouping');
    expect(args[1]).toContain("BA's message:\nCut this portal into processes");
  });
});

describe('classifyOutcome', () => {
  it('tells a fair end from an outage', () => {
    expect(classifyOutcome({ result: 'done' })).toBe('success');
    expect(classifyOutcome({ subtype: 'error_max_budget_usd', is_error: true })).toBe('budget_end');
    expect(classifyOutcome({ is_error: true })).toBe('api_error');
    expect(classifyOutcome({ result: "You've hit your weekly limit" })).toBe('usage_limit');
  });
});
