import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTranscript } from '../src/trace/transcript.js';

const lines = readFileSync(
  new URL('./fixtures/crawler-transcript.jsonl', import.meta.url),
  'utf8',
).split('\n');

const parsed = parseTranscript(lines);
const { turns } = parsed;

describe('parseTranscript', () => {
  it('reads agent and session ids from the entries', () => {
    expect(parsed.agentId).toBe('agent-test-0001');
    expect(parsed.sessionId).toBe('session-test-0001');
  });

  it('emits one row per content block in file order and skips meta, attachment and summary entries', () => {
    expect(turns.map((t) => [t.message_uuid, t.kind])).toEqual([
      ['u-0001', 'text'],
      ['u-0004', 'thinking'],
      ['u-0005', 'tool_use'],
      ['u-0006', 'tool_result'],
      ['u-0007', 'text'],
      ['u-0008', 'tool_use'],
      ['u-0009', 'tool_use'],
      ['u-0010', 'tool_result'],
      ['u-0011', 'tool_result'],
      ['u-0012', 'tool_use'],
      ['u-0013', 'tool_result'],
      ['u-0014', 'text'],
    ]);
    expect(parsed.skipped).toEqual({ entries: 3, unknownBlocks: 1, invalidLines: 0 });
  });

  it('uses apiBlockIndex, else the position inside content', () => {
    const idx = Object.fromEntries(turns.map((t) => [t.message_uuid, t.block_index]));
    expect(idx['u-0009']).toBe(2);
    expect(idx['u-0014']).toBe(1);
    expect(idx['u-0001']).toBe(0);
  });

  it('stores thinking as presence only', () => {
    const thinking = turns.find((t) => t.kind === 'thinking')!;
    expect(thinking.text).toBeNull();
    expect(thinking.role).toBe('assistant');
  });

  it('attaches usage once per API message, on its last block, with the largest output count', () => {
    const withTokens = turns.filter((t) => t.output_tokens !== null);
    expect(withTokens.map((t) => [t.message_uuid, t.api_message_id])).toEqual([
      ['u-0005', 'msg_test_A'],
      ['u-0009', 'msg_test_B'],
      ['u-0012', 'msg_test_C'],
      ['u-0014', 'msg_test_D'],
    ]);
    const b = turns.find((t) => t.message_uuid === 'u-0009')!;
    expect(b).toMatchObject({
      input_tokens: 2,
      output_tokens: 40,
      cache_read_tokens: 5000,
      cache_creation_tokens: 300,
    });
    const sum = (k: 'input_tokens' | 'output_tokens') => turns.reduce((n, t) => n + (t[k] ?? 0), 0);
    expect(sum('input_tokens')).toBe(8);
    expect(sum('output_tokens')).toBe(90);
  });

  it('keeps tool ids, names, error flags and model', () => {
    const nav = turns.find((t) => t.tool_use_id === 'toolu_test_002' && t.kind === 'tool_use')!;
    expect(nav).toMatchObject({
      tool_name: 'mcp__pathfinder__navigate',
      model: 'claude-test-model',
    });
    const failed = turns.find(
      (t) => t.tool_use_id === 'toolu_test_002' && t.kind === 'tool_result',
    )!;
    expect(failed.is_error).toBe(true);
    const ok = turns.find((t) => t.tool_use_id === 'toolu_test_001' && t.kind === 'tool_result')!;
    expect(ok.is_error).toBe(false);
    expect(ok.text).toBe('{"run_id":"run-test-0001","resumed":false}');
  });

  it('flattens array tool results and marks non-text parts', () => {
    const r = turns.find((t) => t.tool_use_id === 'toolu_test_003' && t.kind === 'tool_result')!;
    expect(r.text).toBe('{"states":[]}\n[image]');
  });

  it('masks PII in prompts, text and tool inputs', () => {
    for (const t of turns) expect(t.text ?? '').not.toContain('test.user@example.test');
    expect(turns[0]!.text).toContain('[email]');
    expect(turns.find((t) => t.tool_use_id === 'toolu_test_002')!.text).toContain('[email]');
  });

  it('keeps transcript timestamps', () => {
    expect(turns[0]!.created_at).toBe('2026-01-15T10:00:00.000Z');
  });

  it('counts bad lines instead of throwing and ignores blank ones', () => {
    const out = parseTranscript(['', '{not json', lines[0]!]);
    expect(out.turns).toHaveLength(1);
    expect(out.skipped.invalidLines).toBe(1);
  });

  it('is deterministic', () => {
    expect(parseTranscript(lines)).toEqual(parsed);
  });
});
