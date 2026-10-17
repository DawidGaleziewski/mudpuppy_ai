// Confirming verdicts on differing states (spec 033 US4): the dashboard's Review posts the owner's
// verdicts; one per outcome of the proposal; a confirmed or superseded proposal is not confirmed
// again; another portal's proposal is not found. Over the real route.
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { createReconciliationService } from '../src/reconciliations.js';
import { testService } from './helpers.js';

const P = 'scar-maker';
const T = '2026-10-17T01:00:00.000Z';
const PROPOSAL = [
  { state_id: 'st-offer', verdict: 'main', hypothesis: 'data', reason: 'seen in 1 of 2 scans' },
  { state_id: 'st-sold', verdict: 'variant_flag', hypothesis: 'data', reason: 'seen once' },
];
const OK = {
  author: 'Owner',
  verdicts: [
    { state_id: 'st-offer', verdict: 'main' },
    { state_id: 'st-sold', verdict: 'temporary' },
  ],
};

describe('confirm verdicts on differing states', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  const confirm = (id: string, body: unknown, portal = P) =>
    fetch(`${base}/portals/${portal}/reconciliations/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));
  const row = (id: string) =>
    t.opened.raw
      .prepare('SELECT status, confirmed_json, confirmed_by FROM reconciliations WHERE id = ?')
      .get(id) as { status: string; confirmed_json: string | null; confirmed_by: string | null };

  beforeEach(async () => {
    t = testService();
    const add = t.opened.raw.prepare(
      `INSERT INTO reconciliations (id, portal_id, group_key, group_kind, snapshot_json, proposal_json,
         proposed_by, proposed_at, status) VALUES (?, ?, 'action:home:button:See the offer', 'action',
         '{}', ?, 'session-1', ?, ?)`,
    );
    add.run('rc-1', P, JSON.stringify(PROPOSAL), T, 'proposed');
    add.run('rc-old', P, JSON.stringify(PROPOSAL), T, 'superseded');
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-T', logged: true }),
      findError: () => Promise.resolve(null),
      version: 'test',
      reconciliations: createReconciliationService({ db: t.opened.db }),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });
  afterEach(() => {
    server.close();
  });

  it('confirms the owner verdicts with who, once', async () => {
    expect(await confirm('rc-1', OK)).toEqual({
      status: 200,
      body: { id: 'rc-1', status: 'confirmed' },
    });
    const r = row('rc-1');
    expect(r.status).toBe('confirmed');
    expect(r.confirmed_by).toBe('Owner');
    expect(JSON.parse(r.confirmed_json!)).toEqual(OK.verdicts);
    expect((await confirm('rc-1', OK)).status).toBe(409);
  });

  it('refuses a superseded proposal, another portal, a missing outcome and a verdict off the list', async () => {
    expect((await confirm('rc-old', OK)).status).toBe(409);
    expect((await confirm('rc-1', OK, 'other')).status).toBe(404);
    expect((await confirm('rc-1', { ...OK, verdicts: [OK.verdicts[0]] })).status).toBe(400);
    expect(
      (
        await confirm('rc-1', {
          ...OK,
          verdicts: [OK.verdicts[0], { state_id: 'st-sold', verdict: 'broken' }],
        })
      ).status,
    ).toBe(400);
    expect(row('rc-1').status).toBe('proposed');
  });
});
