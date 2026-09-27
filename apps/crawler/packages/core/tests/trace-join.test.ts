import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { joinTurns, type CallSpanRef } from '../src/trace/join.js';
import { parseTranscript, type ParsedTurn } from '../src/trace/transcript.js';

const parsed = parseTranscript(
  readFileSync(new URL('./fixtures/crawler-transcript.jsonl', import.meta.url), 'utf8').split('\n'),
);
const AGENT = 'agent-test-0001';
const RUN = 'run-test-0001';

const span = (tool_use_id: string | null, over: Partial<CallSpanRef> = {}): CallSpanRef => ({
  id: `span-${tool_use_id}`,
  run_id: RUN,
  tool_use_id,
  agent_id: AGENT,
  name: 'navigate',
  ...over,
});

const spans: CallSpanRef[] = [
  span('toolu_test_001', { name: 'start_run' }),
  span('toolu_test_002'),
  span('toolu_test_003', { name: 'get_known_states' }),
  span('toolu_test_999', { name: 'finish_run' }),
  span('toolu_other', { agent_id: 'agent-other' }),
  span('toolu_elsewhere', { run_id: 'run-other' }),
];

describe('joinTurns', () => {
  const out = joinTurns(parsed.turns, spans, AGENT);

  it('matches tool_use rows to call spans by tool-use id', () => {
    const matched = out.turns.filter((t) => t.matched).map((t) => t.tool_use_id);
    expect(matched).toEqual(['toolu_test_001', 'toolu_test_002', 'toolu_test_003']);
  });

  it('flags pathfinder calls that never reached the server', () => {
    expect(out.unmatchedAgentCalls.map((t) => t.tool_use_id)).toEqual(['toolu_test_004']);
  });

  it('flags this agent’s server calls in matched runs that have no agent turn', () => {
    expect(out.unmatchedServerCalls.map((s) => s.tool_use_id)).toEqual(['toolu_test_999']);
  });

  it('assigns every turn of a single-run transcript to that run', () => {
    expect(new Set(out.turns.map((t) => t.run_id))).toEqual(new Set([RUN]));
  });

  it('does not change the parsed rows otherwise', () => {
    const strip = (t: (typeof out.turns)[number]): ParsedTurn => {
      const copy: Partial<typeof t> = { ...t };
      delete copy.run_id;
      delete copy.matched;
      return copy as ParsedTurn;
    };
    expect(out.turns.map(strip)).toEqual(parsed.turns);
  });
});

describe('joinTurns run assignment', () => {
  const t = (uuid: string, over: Partial<ParsedTurn> = {}): ParsedTurn => ({
    agent_id: AGENT,
    session_id: null,
    message_uuid: uuid,
    block_index: 0,
    api_message_id: null,
    role: 'assistant',
    kind: 'text',
    tool_use_id: null,
    tool_name: null,
    text: uuid,
    is_error: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_creation_tokens: null,
    created_at: '2026-01-15T10:00:00.000Z',
    ...over,
  });
  const use = (uuid: string, id: string) =>
    t(uuid, { kind: 'tool_use', tool_use_id: id, tool_name: 'mcp__pathfinder__navigate' });

  it('uses the nearest following matched call, else the nearest preceding', () => {
    const turns = [
      t('a'),
      use('b', 'toolu_r1'),
      t('c'),
      use('d', 'toolu_r2'),
      t('e'),
      t('f', { kind: 'tool_result', role: 'user', tool_use_id: 'toolu_r1' }),
    ];
    const out = joinTurns(
      turns,
      [span('toolu_r1', { run_id: 'run-1' }), span('toolu_r2', { run_id: 'run-2' })],
      AGENT,
    );
    expect(out.turns.map((x) => [x.message_uuid, x.run_id])).toEqual([
      ['a', 'run-1'],
      ['b', 'run-1'],
      ['c', 'run-2'],
      ['d', 'run-2'],
      ['e', 'run-2'],
      ['f', 'run-1'],
    ]);
  });

  it('leaves run_id null when nothing matches, and ignores non-pathfinder tools', () => {
    const out = joinTurns(
      [t('a'), t('b', { kind: 'tool_use', tool_use_id: 'toolu_x', tool_name: 'SubagentHandback' })],
      [],
      AGENT,
    );
    expect(out.turns.map((x) => x.run_id)).toEqual([null, null]);
    expect(out.unmatchedAgentCalls).toEqual([]);
  });

  it('does not flag server calls when the agent id is unknown', () => {
    const out = joinTurns([use('b', 'toolu_r1')], [span('toolu_r1'), span('toolu_z')], null);
    expect(out.unmatchedServerCalls).toEqual([]);
  });
});
