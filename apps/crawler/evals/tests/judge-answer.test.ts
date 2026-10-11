import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Answer, parseCallOutput, VERDICT_SCHEMA } from '../graders/model/answer.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', 'judge', name), 'utf8');

describe('parseCallOutput on real outputs', () => {
  it('reads a pass with its reason, provenance and usage', () => {
    const out = parseCallOutput(fixture('pass.jsonl'));
    expect(out.answer?.verdict).toBe('pass');
    expect(out.answer?.reason).toMatch(/Autocasco/);
    expect(out.isError).toBe(false);
    expect(out.init).toMatchObject({
      model: 'claude-sonnet-5-5',
      claudeCodeVersion: '2.1.288',
      tools: ['StructuredOutput'],
      mcpServers: [],
    });
    expect(out.init?.plugins.every((p) => p.endsWith('@builtin'))).toBe(true);
    expect(out.usage).toEqual({ input_tokens: 877, output_tokens: 124, usd: 0.004744 });
  });

  it('reads an unknown', () => {
    expect(parseCallOutput(fixture('unknown.jsonl')).answer?.verdict).toBe('unknown');
  });

  it('flags a rejected login as an auth error with no answer', () => {
    const out = parseCallOutput(fixture('auth-401.jsonl'));
    expect(out).toMatchObject({ answer: null, isError: true, authError: true, limitHit: false });
    expect(out.rawResult).toMatch(/401/);
  });
});

describe('parseCallOutput on broken outputs', () => {
  it('gives no answer when the model answered in prose', () => {
    const out = parseCallOutput(fixture('no-structured.jsonl'));
    expect(out).toMatchObject({ answer: null, isError: false, authError: false });
    expect(out.rawResult).toBe('I think it is the same term.');
  });

  it('flags a usage limit', () => {
    expect(parseCallOutput(fixture('limit-hit.jsonl'))).toMatchObject({
      answer: null,
      limitHit: true,
    });
  });

  it('survives output that is not JSON at all', () => {
    const out = parseCallOutput(fixture('garbage.txt'));
    expect(out).toMatchObject({ init: null, answer: null, isError: true, authError: false });
    expect(out.rawResult).toMatch(/something went wrong/);
    expect(out.usage).toEqual({ input_tokens: 0, output_tokens: 0, usd: 0 });
  });

  it('does not mistake a reason mentioning a rate limit for an outage', () => {
    const line = JSON.stringify({
      type: 'result',
      result: '{}',
      structured_output: { reason: 'The rule is about the rate limit of logins.', verdict: 'fail' },
    });
    expect(parseCallOutput(line)).toMatchObject({ limitHit: false, answer: { verdict: 'fail' } });
  });
});

it('the schema and the Zod answer accept the same verdicts', () => {
  expect(VERDICT_SCHEMA.properties.verdict.enum).toEqual(Answer.shape.verdict.options);
  expect(Object.keys(VERDICT_SCHEMA.properties)[0]).toBe('reason');
});
