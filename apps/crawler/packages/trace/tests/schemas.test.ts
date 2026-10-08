import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AgentTurn,
  AgentTurnKind,
  AgentTurnRole,
  PwTraceMode,
  SpanKind,
  SpanStatus,
  TraceBoot,
  TraceLevel,
  TraceServer,
  TraceSpan,
} from '../src/index.js';

const ts = '2026-01-01T00:00:00.000Z';

const MIGRATION_0003 = readFileSync(
  fileURLToPath(new URL('../../../../../data/migrations/0003_trace.up.sql', import.meta.url)),
  'utf-8',
);

/** Extracts one `CREATE TABLE <name> (...) STRICT` body from a SQL file (the trace migration by default). */
function tableBody(table: string, sql = MIGRATION_0003): string {
  const re = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]+?)\\) STRICT`);
  const match = sql.match(re);
  if (!match) throw new Error(`table ${table} not found`);
  return match[1]!;
}

/** Extracts the string list of a `CHECK (<column> IN (...))` clause for one column within a table body. */
function checkList(table: string, column: string, sql = MIGRATION_0003): string[] {
  const re = new RegExp(`\\b${column}\\s+TEXT[^\\n]*CHECK \\(${column} IN \\(([^)]+)\\)\\)`);
  const match = tableBody(table, sql).match(re);
  if (!match) throw new Error(`no CHECK IN clause for ${table}.${column}`);
  return match[1]!.split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
}

describe('trace schemas (R-17)', () => {
  it('Zod enums equal the 0003_trace CHECK lists', () => {
    expect(TraceServer.options).toEqual(checkList('trace_boots', 'server'));
    expect(TraceLevel.options).toEqual(checkList('trace_boots', 'trace_level'));
    expect(PwTraceMode.options).toEqual(checkList('trace_boots', 'pw_trace'));
    expect(SpanKind.options).toEqual(checkList('trace_spans', 'kind'));
    expect(SpanStatus.options).toEqual(checkList('trace_spans', 'status'));
    expect(AgentTurnRole.options).toEqual(checkList('agent_turns', 'role'));
    expect(AgentTurnKind.options).toEqual(checkList('agent_turns', 'kind'));
  });

  const boot = {
    id: 'b',
    started_at: ts,
    ended_at: null,
    environment: 'sandbox',
    server: 'pathfinder',
    pid: 123,
    version: '0.1.0',
    trace_level: 'standard',
    pw_trace: 'non_production',
  };
  it('accepts a valid trace_boots row and rejects a bad server/trace_level', () => {
    expect(TraceBoot.safeParse(boot).success).toBe(true);
    expect(TraceBoot.safeParse({ ...boot, server: 'ba' }).success).toBe(false);
    expect(TraceBoot.safeParse({ ...boot, trace_level: 'debug' }).success).toBe(false);
  });

  const span = {
    id: 's',
    boot_id: 'b',
    seq: 1,
    run_id: 'r',
    parent_id: null,
    kind: 'call',
    name: 'navigate',
    status: 'ok',
    started_at: ts,
    ended_at: ts,
    duration_ms: 42,
    attrs_json: {},
    payload_ref: null,
    summary: 'navigated to /oferty',
    decision_id: null,
    tool_use_id: 'tu_1',
    agent_id: 'ag_1',
    rationale: 'checking the listing page loads',
    pw_trace_path: null,
    between_calls: 0,
  };
  it('accepts a valid trace_spans row and rejects a bad kind/status', () => {
    expect(TraceSpan.safeParse(span).success).toBe(true);
    expect(TraceSpan.safeParse({ ...span, kind: 'span' }).success).toBe(false);
    expect(TraceSpan.safeParse({ ...span, status: 'pending' }).success).toBe(false);
  });
  it('requires duration_ms on a completed call/phase span, not on events or running/unfinished spans', () => {
    expect(TraceSpan.safeParse({ ...span, duration_ms: null }).success).toBe(false);
    expect(
      TraceSpan.safeParse({ ...span, kind: 'event', duration_ms: null, ended_at: null }).success,
    ).toBe(true);
    expect(
      TraceSpan.safeParse({ ...span, status: 'running', duration_ms: null, ended_at: null })
        .success,
    ).toBe(true);
    expect(TraceSpan.safeParse({ ...span, status: 'unfinished', duration_ms: null }).success).toBe(
      true,
    );
  });
  it('rejects a rationale over 300 chars', () => {
    expect(TraceSpan.safeParse({ ...span, rationale: 'x'.repeat(301) }).success).toBe(false);
    expect(TraceSpan.safeParse({ ...span, rationale: 'x'.repeat(300) }).success).toBe(true);
  });

  const turn = {
    id: 'at',
    agent_id: 'ag_1',
    agent_type: 'crawler',
    session_id: 'sess_1',
    message_uuid: 'm1',
    block_index: 0,
    api_message_id: 'msg_1',
    run_id: 'r',
    role: 'assistant',
    kind: 'text',
    tool_use_id: null,
    tool_name: null,
    text: 'looking at the listing page',
    payload_ref: null,
    is_error: null,
    model: 'claude-sonnet-5',
    input_tokens: 10,
    output_tokens: 20,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    matched: 0,
    created_at: ts,
    imported_at: ts,
  };
  it('accepts a valid agent_turns row and rejects a bad role/kind', () => {
    expect(AgentTurn.safeParse(turn).success).toBe(true);
    expect(AgentTurn.safeParse({ ...turn, role: 'system' }).success).toBe(false);
    expect(AgentTurn.safeParse({ ...turn, kind: 'audio' }).success).toBe(false);
  });
});
