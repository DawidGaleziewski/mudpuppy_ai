// Split and merge of the grouping suggestions (spec 039 T079, designer screen v2-09): a person
// cuts a suggestion in two or joins two; what they replaced is dismissed, so the same set of
// screens is never suggested again. Over the real HTTP routes.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
   -- the routes' JSON answers are read loosely; their shapes are what the assertions check. */
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { createProcessService } from '../src/process-service.js';
import { testService } from './helpers.js';

const P = 'reference-insurer';
const T = '2026-10-21T08:00:00.000Z';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('grouping suggestions: split and merge', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    t = testService();
    const raw = t.opened.raw;
    raw
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
         VALUES ('run-1', ?, 'guest', 'map', 'sandbox', '2026-10-21', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
      )
      .run(P, T);
    for (const [id, route] of [
      ['s-home', '/'],
      ['s-car', '/samochod'],
      ['s-driver', '/kalkulator/kierowca'],
      ['s-options', '/kalkulator/opcje'],
    ] as const)
      raw
        .prepare(
          `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
           VALUES (?, ?, ?, 'c', ?, ?, 'ev', 'observed', 'settled', 'run-1', ?)`,
        )
        .run(id, P, `fp-${id}`, route, `Title ${route}`, T);
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-T', logged: true }),
      findError: () => Promise.resolve(null),
      version: 'test',
      processes: createProcessService({ db: t.opened.db }),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });

  afterEach(async () => {
    server.close();
    t.service.close();
    await t.opened.close();
  });

  const call = async (path: string, body: Json) => {
    const res = await fetch(`${base}/portals/${P}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Json };
  };
  const ids = (s: Json) => s.steps.map((st: Json) => st.state_id) as string[];

  it('splits in two before a step and merges with another, dismissing what it replaced', async () => {
    const svc = createProcessService({ db: t.opened.db });
    const all = await svc.suggest(P, null, {
      name: 'Quote',
      persona: 'guest',
      state_ids: ['s-home', 's-car', 's-driver', 's-options'],
      why: 'form continues',
    });
    expect((await call(`/suggestions/${all.id}/split`, { author: 'Anna', at: 5 })).status).toBe(
      400,
    );
    const split = await call(`/suggestions/${all.id}/split`, { author: 'Anna', at: '3' });
    expect(split.status).toBe(201);
    const [first, second] = split.body as Json[];
    expect(first).toMatchObject({ name: 'Quote · part 1', why: 'Split by Anna from "Quote".' });
    expect(ids(first!)).toEqual(['s-home', 's-car']);
    expect(ids(second!)).toEqual(['s-driver', 's-options']);
    // the whole set was dismissed by the split: never suggested again
    await expect(
      svc.suggest(P, null, {
        name: 'Again',
        persona: 'guest',
        state_ids: ['s-home', 's-car', 's-driver', 's-options'],
        why: 'x',
      }),
    ).rejects.toMatchObject({ extra: { code: 'DISMISSED' } });
    const self = await call(`/suggestions/${first!.id}/merge`, { author: 'Anna', with: first!.id });
    expect(self.status).toBe(400);
    // merging back gives the set the split dismissed: refused, and nothing changed
    const back = await call(`/suggestions/${first!.id}/merge`, {
      author: 'Anna',
      with: second!.id,
    });
    expect(back.status).toBe(409);
    expect((await call(`/suggestions/${second!.id}/dismiss`, { author: 'Anna' })).status).toBe(200);
    const other = await svc.suggest(P, null, {
      name: 'Options',
      persona: 'guest',
      state_ids: ['s-options'],
      why: 'own page',
    });
    const joined = await call(`/suggestions/${first!.id}/merge`, {
      author: 'Anna',
      with: other.id,
    });
    expect(joined.status).toBe(201);
    expect(joined.body).toMatchObject({ name: 'Quote · part 1 + Options', status: 'open' });
    expect(ids(joined.body)).toEqual(['s-home', 's-car', 's-options']);
    expect((await call(`/suggestions/${other.id}/accept`, { author: 'Anna' })).status).toBe(409);
  });
});
