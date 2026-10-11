import { describe, expect, it } from 'vitest';
import type { CallRequest, CallResult } from '../graders/model/call.js';
import { defineJudge, type Pair } from '../graders/model/definition.js';
import { runJudge } from '../graders/model/run.js';
import { JudgeSetupError } from '../graders/model/setup-error.js';

const judge = defineJudge({
  id: 'glossary-terms',
  category: 'terms',
  question: 'Same term?',
  pass: 'Same.',
  fail: 'Not the same.',
  examples: [],
  selectPairs: () => [],
});
const login = { source: 'token-file' as const, path: '/x', token: 'sk-ant-test-key-not-real' };
const pairs: Pair[] = ['a', 'b', 'c', 'd', 'e'].map((k) => ({
  id: `${k}~R@1`,
  itemId: k,
  item: k,
  record: { key: 'R', rev: 1, kind: 'glossary_term', text: `term_verbatim: ${k}` },
}));

function result(over: Partial<CallResult>): CallResult {
  return {
    init: {
      model: 'claude-sonnet-5-5',
      claudeCodeVersion: '2.1.288',
      tools: ['StructuredOutput'],
      mcpServers: [],
      plugins: [],
      skills: [],
      agents: [],
      memoryAuto: null,
    },
    answer: { reason: 'Same term.', verdict: 'pass' },
    rawResult: '{}',
    isError: false,
    authError: false,
    limitHit: false,
    usage: { input_tokens: 900, output_tokens: 100, usd: 0.005 },
    durationMs: 10,
    timedOut: false,
    configDir: '/tmp/x',
    ...over,
  };
}
const itemOf = (r: CallRequest) => /<item>\n(\w+)/.exec(r.user)![1]!;

describe('runJudge', () => {
  it('judges every pair once per run, never more than the concurrency at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    const call = async (r: CallRequest) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((ok) => setImmediate(ok));
      inFlight -= 1;
      return result({
        answer: { reason: `r-${itemOf(r)}`, verdict: itemOf(r) === 'b' ? 'fail' : 'pass' },
      });
    };
    const out = await runJudge(judge, pairs, { login, runs: 3, concurrency: 2, call });
    expect(peak).toBe(2);
    expect(out.runs).toHaveLength(3);
    expect(out.runs[2]!.map((v) => [v.pairId, v.verdict])).toEqual([
      ['a~R@1', 'pass'],
      ['b~R@1', 'fail'],
      ['c~R@1', 'pass'],
      ['d~R@1', 'pass'],
      ['e~R@1', 'pass'],
    ]);
    expect(out.cost).toEqual({ usd: 0.075, input_tokens: 13500, output_tokens: 1500, calls: 15 });
    expect(out).toMatchObject({ model: 'claude-sonnet-5-5', claudeCodeVersion: '2.1.288' });
  });

  it('retries once, then records an error verdict with the cause', async () => {
    const seen: Record<string, number> = {};
    const call = (r: CallRequest) => {
      const k = itemOf(r);
      seen[k] = (seen[k] ?? 0) + 1;
      if (k === 'a' && seen[k] === 1)
        return Promise.resolve(result({ answer: null, rawResult: 'prose' }));
      if (k === 'b')
        return Promise.resolve(result({ answer: null, isError: true, rawResult: 'overloaded' }));
      if (k === 'c') return Promise.reject(new Error('spawn EAGAIN'));
      return Promise.resolve(result({}));
    };
    const out = await runJudge(judge, pairs, { login, call });
    const byPair = Object.fromEntries(out.runs[0]!.map((v) => [v.pairId, v]));
    expect(byPair['a~R@1']).toMatchObject({ verdict: 'pass', attempts: 2 });
    expect(byPair['b~R@1']).toMatchObject({ verdict: 'error', attempts: 2 });
    expect(byPair['b~R@1']!.reason).toMatch(/call failed: overloaded/);
    expect(byPair['c~R@1']!.reason).toMatch(/crashed: spawn EAGAIN/);
    expect(byPair['d~R@1']).toMatchObject({ verdict: 'pass', attempts: 1 });
    expect(seen).toMatchObject({ a: 2, b: 2, c: 2, d: 1 });
  });

  it('stops the whole run on a login problem or a usage limit', async () => {
    let calls = 0;
    const rejected = () => {
      calls += 1;
      return Promise.reject(new JudgeSetupError('TOKEN_REJECTED', 'rejected'));
    };
    await expect(runJudge(judge, pairs, { login, concurrency: 1, call: rejected })).rejects.toThrow(
      'rejected',
    );
    expect(calls).toBe(1);
    const limited = () =>
      Promise.resolve(result({ answer: null, limitHit: true, rawResult: 'hit your limit' }));
    await expect(runJudge(judge, pairs, { login, call: limited })).rejects.toMatchObject({
      code: 'USAGE_LIMIT',
    });
  });
});
