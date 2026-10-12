import { describe, expect, it } from 'vitest';
import { NavigationHop, PageVisit } from '../src/index.js';

const visit = {
  id: 'v1',
  run_id: 'r1',
  state_id: 's1',
  edge_id: null,
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

describe('PageVisit (spec 019)', () => {
  it('parses a visit with every hop kind it carries, URL kept verbatim', () => {
    expect(PageVisit.parse(visit)).toEqual(visit);
  });

  it('refuses an unknown via, an unknown hop kind and an empty URL', () => {
    expect(PageVisit.safeParse({ ...visit, via: 'teleport' }).success).toBe(false);
    expect(NavigationHop.safeParse({ url: 'http://x/', kind: 'warp' }).success).toBe(false);
    expect(PageVisit.safeParse({ ...visit, url: '' }).success).toBe(false);
  });
});
