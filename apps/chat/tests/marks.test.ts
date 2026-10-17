// Probe marks (spec 032 US5, owner answer 3 of 2026-10-17): the BA marks a recorded form step for
// probing; one open mark per step; removing it deletes only the open mark; a used one stays as
// history. Over the real routes.
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { createMarkService } from '../src/marks.js';
import { testService } from './helpers.js';

const P = 'scar-maker';
const T = '2026-10-17T01:00:00.000Z';
const MARK = { author: 'owner', kind: 'probe', target_kind: 'form_step', target_id: 'fs-2' };

describe('Probe marks on form steps', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  const send = (method: string, body: unknown) =>
    fetch(`${base}/portals/${P}/marks`, { method, body: JSON.stringify(body) }).then(async (r) => ({
      status: r.status,
      body: (await r.json()) as Record<string, unknown>,
    }));
  const open = () =>
    t.opened.raw
      .prepare('SELECT target_id, created_by FROM marks WHERE used_by_run_id IS NULL')
      .all();

  beforeEach(async () => {
    t = testService();
    const raw = t.opened.raw;
    raw
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
         VALUES ('run-1', ?, 'quote-tester', 'map', 'sandbox', '2026-10-17', '1366x768', 'en-GB', 'chromium', '{}', 'completed', ?)`,
      )
      .run(P, T);
    raw
      .prepare(
        `INSERT INTO form_steps (id, portal_id, route_template, step_index, form_name, controls_json, label, first_seen_run, created_at)
         VALUES ('fs-2', ?, '/sc19/apply', 2, NULL, '[]', 'Your cover', 'run-1', ?)`,
      )
      .run(P, T);
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-T', logged: true }),
      findError: () => Promise.resolve(null),
      version: 'test',
      marks: createMarkService({ db: t.opened.db }),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });
  afterEach(() => {
    server.close();
  });

  it('marks a step once, and removes the open mark', async () => {
    const first = await send('POST', MARK);
    expect(first).toMatchObject({ status: 201, body: { created: true } });
    expect(await send('POST', MARK)).toMatchObject({
      status: 200,
      body: { id: first.body.id, created: false },
    });
    expect(open()).toEqual([{ target_id: 'fs-2', created_by: 'owner' }]);
    expect(await send('DELETE', MARK)).toMatchObject({ status: 200, body: { removed: 1 } });
    expect(open()).toEqual([]);
  });

  it('keeps a used mark when the step is marked again or the open mark removed', async () => {
    const first = await send('POST', MARK);
    t.opened.raw
      .prepare(`UPDATE marks SET used_by_run_id = 'run-1', used_at = ? WHERE id = ?`)
      .run(T, first.body.id);
    expect(await send('POST', MARK)).toMatchObject({ status: 201 });
    expect(await send('DELETE', MARK)).toMatchObject({ body: { removed: 1 } });
    const all = t.opened.raw.prepare('SELECT used_by_run_id FROM marks').all();
    expect(all).toEqual([{ used_by_run_id: 'run-1' }]);
  });

  it('refuses another kind, another target and an unknown step', async () => {
    expect((await send('POST', { ...MARK, kind: 'skip' })).status).toBe(400);
    expect((await send('POST', { ...MARK, target_kind: 'state' })).status).toBe(400);
    expect((await send('POST', { ...MARK, target_id: 'fs-9' })).status).toBe(404);
    expect((await send('PUT', MARK)).status).toBe(405);
  });
});
