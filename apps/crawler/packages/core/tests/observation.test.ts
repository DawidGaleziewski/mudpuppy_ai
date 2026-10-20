import { describe, expect, it } from 'vitest';
import { NavigationHop, Observation } from '../src/index.js';

const observation = {
  id: 'v1',
  run_id: 'r1',
  state_id: 's1',
  transition_id: null,
  via: 'navigate',
  url: 'http://127.0.0.1:4100/legacy/bank/wyciag.do;jsessionid=AB?konto=7&typ=M',
  hops: [
    { url: 'http://127.0.0.1:4100/polisa.php?id=7', kind: 'start' },
    { url: 'http://127.0.0.1:4100/stare/polisa/7', kind: 'meta_refresh' },
    { url: 'http://127.0.0.1:4100/x', kind: 'http', status: 302 },
    { url: 'http://elsewhere.test/', kind: 'blocked', reason: 'out of scope' },
  ],
  created_at: '2026-10-11T10:00:00.000Z',
};

describe('Observation (spec 019, spec 039)', () => {
  it('parses an observation with every hop kind it carries, URL kept verbatim', () => {
    expect(Observation.parse(observation)).toEqual({ ...observation, flags: {} });
  });

  it('refuses an unknown via, an unknown hop kind and an empty URL', () => {
    expect(Observation.safeParse({ ...observation, via: 'teleport' }).success).toBe(false);
    expect(NavigationHop.safeParse({ url: 'http://x/', kind: 'warp' }).success).toBe(false);
    expect(Observation.safeParse({ ...observation, url: '' }).success).toBe(false);
  });
});
