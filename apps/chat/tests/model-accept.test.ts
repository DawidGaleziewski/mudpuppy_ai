// A person accepts the screen threshold or the similarity classifier from the dashboard (spec 039
// owner answers 5 and 14): `POST /portals/{p}/model/accept`, refused plainly when not ready.
import type { Server } from 'node:http';
import { activeClassifier, activeProfile, recordClassifier } from '@pathfinder/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { testService } from './helpers.js';

const P = 'shop';

describe('model accept route', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  const accept = (body: unknown) =>
    fetch(`${base}/portals/${P}/model/accept`, { method: 'POST', body: JSON.stringify(body) }).then(
      async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }),
    );

  beforeEach(async () => {
    t = testService();
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-T', logged: true }),
      findError: () => Promise.resolve(null),
      version: 'test',
      modelStore: t.opened.raw,
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });
  afterEach(() => {
    server.close();
  });

  it('refuses τ without enough labels and accepts a classifier that beat τ', async () => {
    const tau = await accept({ what: 'tau', by: 'Anna' });
    expect(tau.status).toBe(409);
    expect(String(tau.body.message)).toContain('no calibrated τ');

    const none = await accept({ what: 'classifier', by: 'Anna' });
    expect(none.status).toBe(409);
    const profile = activeProfile(t.opened.raw, P);
    recordClassifier(
      t.opened.raw,
      P,
      profile,
      {
        ok: true,
        names: ['minhash', 'structure', 'content', 'overlay', 'calls', 'mounts', 'elements'],
        weights: [1, 1, 0, 0, 0, 0, 0],
        intercept: -1,
        labels: 40,
        held_out: 8,
        f1: 0.9,
        tau_f1: 0.7,
        better: true,
      },
      0.8,
    );
    const ok = await accept({ what: 'classifier', by: 'Anna' });
    expect(ok).toMatchObject({ status: 201, body: { classifier: { f1: 0.9, tauF1: 0.7 } } });
    expect(activeClassifier(t.opened.raw, P, profile)?.intercept).toBe(-1);
    expect((await accept({ what: 'other', by: 'Anna' })).status).toBe(400);
  });
});
