import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { NetworkRecorder } from '../src/network-recorder.js';

function fakePage() {
  const handlers = new Map<string, ((a: unknown) => void)[]>();
  const page = {
    on: (e: string, f: (a: unknown) => void) => handlers.set(e, [...(handlers.get(e) ?? []), f]),
    off: () => {},
  } as unknown as Page;
  const emit = (e: string, a: unknown) => handlers.get(e)?.forEach((f) => f(a));
  return { page, emit };
}

const response = (text: () => Promise<string>) => ({
  request: () => ({
    resourceType: () => 'fetch',
    method: () => 'GET',
    url: () => 'https://shop.pl/api/poll',
    postData: () => null,
    headers: () => ({}),
  }),
  headers: () => ({ 'content-type': 'application/json' }),
  status: () => 200,
  text,
});

describe('NetworkRecorder body reads', () => {
  it('does not hang drain when a response body never arrives; the call is kept with an unknown shape', async () => {
    const { page, emit } = fakePage();
    const rec = new NetworkRecorder(page, { bodyTimeoutMs: 20 });
    emit(
      'response',
      response(() => new Promise<string>(() => {})),
    );
    emit(
      'response',
      response(async () => '{"ok":true}'),
    );
    const started = Date.now();
    const out = await rec.drain();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(out.calls).toHaveLength(2);
    expect(out.calls.map((c) => c.url_template)).toEqual(['/api/poll', '/api/poll']);
    expect(out.calls[0]!.res_schema).not.toEqual(out.calls[1]!.res_schema);
  });
});
