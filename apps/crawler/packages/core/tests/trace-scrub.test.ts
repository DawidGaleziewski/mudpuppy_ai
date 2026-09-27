import { describe, expect, it } from 'vitest';
import { scrubTraceJson, scrubTraceText } from '../src/trace/scrub.js';

const RUN = '01a0da20-3022-7000-9ef1-6ac7ce1a0035';
const SHA = 'a'.repeat(64);

describe('scrubTraceJson', () => {
  it('keeps server-issued ids and hashes under id-like keys', () => {
    expect(
      scrubTraceJson({
        run_id: RUN,
        action_ids: [RUN],
        id: RUN,
        evidence_ref: `${SHA}.yaml`,
        level1: SHA,
        matched: SHA,
      }),
    ).toEqual({
      run_id: RUN,
      action_ids: [RUN],
      id: RUN,
      evidence_ref: `${SHA}.yaml`,
      level1: SHA,
      matched: SHA,
    });
  });

  it('still masks a token-shaped value under any other key', () => {
    expect(scrubTraceJson({ cart: RUN, note: `id ${RUN}` })).toEqual({
      cart: '[token]',
      note: 'id [token]',
    });
  });

  it('lets a sensitive key win over the id rule', () => {
    expect(scrubTraceJson({ session_id: RUN })).toEqual({ session_id: '[redacted]' });
  });

  it('still masks PII under an id-like key when the value is not id-shaped', () => {
    expect(scrubTraceJson({ user_id: 'test.user@example.test' })).toEqual({ user_id: '[email]' });
  });

  it('keeps redacting sensitive keys', () => {
    expect(scrubTraceJson({ password: 'test-pass-not-real', nested: { token: 'x' } })).toEqual({
      password: '[redacted]',
      nested: { token: '[redacted]' },
    });
  });

  it('passes numbers, booleans and null through', () => {
    expect(scrubTraceJson({ n: 1, b: true, z: null })).toEqual({ n: 1, b: true, z: null });
  });
});

describe('scrubTraceText', () => {
  it('scrubs JSON text structurally so ids survive', () => {
    expect(scrubTraceText(`{"run_id":"${RUN}","mail":"test.user@example.test"}`)).toBe(
      `{"run_id":"${RUN}","mail":"[email]"}`,
    );
  });

  it('masks plain text', () => {
    expect(scrubTraceText('write to test.user@example.test')).toBe('write to [email]');
  });
});
