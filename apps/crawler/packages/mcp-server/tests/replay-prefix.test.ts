// Spec 040 T032 (design § 9, cheap starts): a later replay with the same prefix starts where an
// earlier one got to, by the page's address, once it is the same state; else from the start.
import { describe, expect, it } from 'vitest';
import type { ToolCall } from '../src/local-client.js';
import { prefixCache, replay, type ReplayPlan } from '../src/replay-driver.js';

/** A three-page portal: / → (k1) /a → (k2) /b → (k3) /done. `moved` sends /b elsewhere. */
function portal(opts: { moved?: boolean } = {}) {
  const log: string[] = [];
  const pages: Record<string, { state: string; next?: [string, string] }> = {
    '/': { state: 's0', next: ['k1', '/a'] },
    '/a': { state: 's1', next: ['k2', '/b'] },
    '/b': { state: opts.moved ? 'elsewhere' : 's2', next: ['k3', '/done'] },
    '/done': { state: 's3' },
  };
  let at = '/';
  const body = (url: string) => {
    const p = pages[url]!;
    return {
      state_id: p.state,
      transition_id: `t-${url}`,
      actions: p.next
        ? [{ action_id: `a-${p.next[0]}`, element_key: p.next[0], allowed: true }]
        : [],
    };
  };
  const call: ToolCall = (name, args) => {
    log.push(name === 'navigate' ? `navigate ${String(args.url)}` : name);
    if (name === 'start_run') return Promise.resolve({ isError: false, body: { run_id: 'r' } });
    if (name === 'finish_run') return Promise.resolve({ isError: false, body: {} });
    if (name === 'navigate') at = String(args.url);
    if (name === 'act') at = pages[at]!.next![1];
    return Promise.resolve({ isError: false, body: body(at) });
  };
  const urlOf = (_run: string, state: string) =>
    Object.entries(pages).find(([, p]) => p.state === state)?.[0] ?? null;
  return { call, log, urlOf };
}

const plan: ReplayPlan = {
  portal: 'ins',
  persona: 'guest',
  environment: 'sandbox',
  startUrl: '/',
  steps: ['k1', 'k2', 'k3'],
  inputs: { 'input.age': '20' },
  purpose: 'boundary test',
};

describe('the headless driver starts where an earlier replay of the same prefix got to', () => {
  it('replays the first plan whole and the second from its longest cached prefix', async () => {
    const p = portal();
    const cache = prefixCache(p.urlOf);
    expect((await replay(p.call, plan, cache)).status).toBe('reached');
    p.log.length = 0;
    const second = await replay(p.call, plan, cache);
    expect(second).toMatchObject({ status: 'reached', stateId: 's3' });
    expect(p.log).toEqual(['start_run', 'navigate /b', 'act', 'finish_run']);
    expect(cache.saved).toBe(2);
  });

  it('other inputs are another prefix; a page that is now elsewhere replays from the start', async () => {
    const p = portal();
    const cache = prefixCache(p.urlOf);
    await replay(p.call, plan, cache);
    p.log.length = 0;
    await replay(p.call, { ...plan, inputs: { 'input.age': '17' } }, cache);
    expect(p.log.filter((l) => l.startsWith('navigate'))).toEqual(['navigate /']);
    const moved = portal({ moved: true });
    const stale = prefixCache(moved.urlOf);
    stale.reached = cache.reached;
    const out = await replay(moved.call, plan, stale);
    expect(moved.log.filter((l) => l.startsWith('navigate'))).toEqual([
      'navigate /b',
      'navigate /',
    ]);
    expect(out.status).toBe('reached');
    expect(stale.saved).toBe(0);
  });
});
