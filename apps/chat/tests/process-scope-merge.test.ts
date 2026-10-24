// Spec 078 (designer T-05, T-06): adding screens to a saved process is a scope change (A rebuilt
// from the observed moves, the rest kept off the observed path), and two saved processes of one
// persona merge with one absorbing the other; Undo puts everything back. Over the real HTTP routes.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return
   -- the routes' JSON answers are read loosely; their shapes are what the assertions check. */
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { placeStates } from '../src/process-scope.js';
import { createProcessService } from '../src/process-service.js';
import { testService } from './helpers.js';

const P = 'reference-insurer';
const T = '2026-10-24T08:00:00.000Z';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('placeStates (pure)', () => {
  const links = [
    { from: 'car', to: 'driver' },
    { from: 'driver', to: 'options' },
    { from: 'quote', to: 'home' },
  ];
  it('puts a screen after the one a move reaches it from, or before the one it moves to', () => {
    expect(placeStates(['home', 'car'], ['driver'], links)).toEqual({ order: ['home', 'car', 'driver'], off: [] });
    expect(placeStates(['home', 'car'], ['quote'], links)).toEqual({ order: ['quote', 'home', 'car'], off: [] });
  });
  it('links through a screen placed in the same change, and keeps the rest off the path', () => {
    expect(placeStates(['home', 'car'], ['options', 'driver', 'contact'], links)).toEqual({ order: ['home', 'car', 'driver', 'options'], off: ['contact'] });
  });
});

describe('Scope and merge over HTTP', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  const sql = (q: string, ...args: unknown[]) => t.opened.raw.prepare(q).run(...args);
  const get = (q: string, ...args: unknown[]) => t.opened.raw.prepare(q).get(...args) as Json;
  const all = (q: string, ...args: unknown[]) => t.opened.raw.prepare(q).all(...args) as Json[];

  beforeEach(async () => {
    t = testService();
    sql(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
       VALUES ('run-1', ?, 'guest', 'map', 'sandbox', '2026-10-24', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
      P,
      T,
    );
    for (const id of ['home', 'car', 'driver', 'options', 'contact'])
      sql(
        `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
         VALUES (?, ?, ?, 'c', ?, ?, 'ev', 'observed', 'settled', 'run-1', ?)`,
        id,
        P,
        `fp-${id}`,
        `/${id}`,
        id[0]!.toUpperCase() + id.slice(1),
        T,
      );
    for (const [from, to] of [
      ['home', 'car'],
      ['car', 'driver'],
    ])
      sql(
        `INSERT INTO transitions (id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref, confidence, stabilization, created_at)
         VALUES (?, 'run-1', ?, ?, '{}', 'read', 'executed', 'ev', 'observed', 'settled', ?)`,
        `t-${from}-${to}`,
        from,
        to,
        T,
      );
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-T', logged: true }),
      findError: () => Promise.resolve(null),
      version: 'test',
      processes: createProcessService({ db: t.opened.db, raw: t.opened.raw }),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });

  afterEach(async () => {
    server.close();
    t.service.close();
    await t.opened.close();
  });

  const call = async (path: string, body: Json) => {
    const res = await fetch(`${base}/portals/${P}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Json };
  };
  const make = async (name: string, states: string[], persona = 'guest') => (await call('/processes', { name, persona, state_ids: states, author: 'anna' })).body;
  const stepsOf = (processId: string) => {
    const a = get(`SELECT id, rev FROM process_models WHERE process_id = ? AND label = 'A'`, processId);
    const r = get('SELECT steps, change FROM process_model_revisions WHERE model_id = ? AND rev = ?', a.id, a.rev);
    return { rev: a.rev as number, change: r.change as string, states: (JSON.parse(r.steps as string) as Json[]).map((s) => s.state_id) };
  };

  it('adds a screen a move reaches to A, keeps one no move reaches off the path, and Undo takes both out', async () => {
    const made = await make('Oblicz składkę', ['home', 'car']);
    const id = made.process.id as string;
    const added = await call(`/processes/${id}/scope`, { state_ids: ['driver', 'contact'], author: 'anna' });
    expect(added.status).toBe(200);
    expect(added.body.added).toEqual([
      { state_id: 'driver', title: 'Driver', on_path: true },
      { state_id: 'contact', title: 'Contact', on_path: false },
    ]);
    expect(stepsOf(id)).toEqual({ rev: 2, change: 'scope', states: ['home', 'car', 'driver'] });
    expect(all('SELECT state_id FROM process_scope_screens WHERE process_id = ? AND removed_at IS NULL', id)).toEqual([{ state_id: 'contact' }]);
    // the menu never adds a screen twice (designer: "already in")
    expect((await call(`/processes/${id}/scope`, { state_ids: ['driver'], author: 'anna' })).status).toBe(409);
    // to-be models don't change: none was touched
    expect(all(`SELECT label FROM process_models WHERE process_id = ?`, id)).toEqual([{ label: 'A' }]);
    const undo = await call(`/processes/${id}/scope/remove`, { state_ids: ['driver', 'contact'], author: 'anna' });
    expect(undo.status).toBe(200);
    expect(stepsOf(id)).toEqual({ rev: 3, change: 'scope', states: ['home', 'car'] });
    expect(all('SELECT state_id FROM process_scope_screens WHERE process_id = ? AND removed_at IS NULL', id)).toEqual([]);
  });

  it('merges two processes of one persona: one absorbs the other, its to-be moves over, Undo puts all back', async () => {
    const keep = (await make('Oblicz składkę', ['home', 'car'])).process;
    const absorb = (await make('Test process', ['car', 'driver'])).process;
    await call(`/processes/${absorb.id as string}/models`, { from: 'A', author: 'anna' });
    const dry = await call('/processes/merge', { keep: keep.id, absorb: absorb.id, dry_run: true, author: 'anna' });
    expect(dry.status).toBe(200);
    expect(dry.body.plan.scope).toEqual({ states: ['home', 'car', 'driver'], from_absorbed: ['driver'], off_path: [] });
    expect(dry.body.plan.moves).toEqual([{ model_id: expect.any(String), from_label: 'B', to_label: 'B' }]);
    expect(dry.body.plan.as_is_rev).toBe(2);
    expect(stepsOf(keep.id).rev).toBe(1); // a dry run writes nothing
    const done = await call('/processes/merge', { keep: keep.id, absorb: absorb.id, name: 'Oblicz składkę OC/AC', reason: 'one flow', author: 'anna' });
    expect(done.status).toBe(200);
    expect(stepsOf(keep.id)).toEqual({ rev: 2, change: 'merge', states: ['home', 'car', 'driver'] });
    expect(get('SELECT name FROM ba_processes WHERE id = ?', keep.id).name).toBe('Oblicz składkę OC/AC');
    expect(get('SELECT archived_at FROM ba_processes WHERE id = ?', absorb.id).archived_at).not.toBeNull();
    expect(all(`SELECT label FROM process_models WHERE process_id = ? ORDER BY label`, keep.id)).toEqual([{ label: 'A' }, { label: 'B' }]);
    const undone = await call(`/merges/${done.body.merge.id as string}/undo`, { author: 'anna' });
    expect(undone.status).toBe(200);
    expect(stepsOf(keep.id)).toEqual({ rev: 3, change: 'unmerge', states: ['home', 'car'] });
    expect(get('SELECT name, archived_at FROM ba_processes WHERE id = ?', keep.id)).toEqual({ name: 'Oblicz składkę', archived_at: null });
    expect(get('SELECT archived_at FROM ba_processes WHERE id = ?', absorb.id).archived_at).toBeNull();
    expect(all(`SELECT label FROM process_models WHERE process_id = ? ORDER BY label`, absorb.id)).toEqual([{ label: 'A' }, { label: 'B' }]);
    expect((await call(`/merges/${done.body.merge.id as string}/undo`, { author: 'anna' })).status).toBe(409);
  });

  it("tells the absorbed process's PROC record, and Split back takes the note back (spec 079 FR-004)", async () => {
    const keep = (await make('Oblicz składkę', ['home', 'car'])).process;
    const absorb = (await make('Test process', ['car', 'driver'])).process;
    sql(
      `INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json, started_at, ended_at)
       VALUES ('sess-1', ?, 'completed', '[]', 's', '[]', ?, ?)`,
      P,
      T,
      T,
    );
    sql(
      `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, created_at, updated_at, process_id)
       VALUES ('rec-1', ?, 'process', 'PROC-002', 2, 'Test process', 1, ?, ?, ?)`,
      P,
      T,
      T,
      absorb.id,
    );
    sql(
      `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence, status, created_at)
       VALUES ('rev-1', 'rec-1', 1, 'sess-1', 'create', '{"title":"Test process"}', 'observed', 'draft', ?)`,
      T,
    );
    const done = await call('/processes/merge', { keep: keep.id, absorb: absorb.id, author: 'anna' });
    expect(done.status).toBe(200);
    await call(`/merges/${done.body.merge.id as string}/undo`, { author: 'ola' });
    expect(all(`SELECT action, reviewer, text FROM doc_reviews WHERE revision_id = 'rev-1' ORDER BY created_at, rowid`)).toEqual([
      { action: 'comment', reviewer: 'anna', text: `Merged into ${keep.key as string} Oblicz składkę by anna: this process is archived; revise or withdraw this record.` },
      { action: 'comment', reviewer: 'ola', text: `Split back from ${keep.key as string} Oblicz składkę: the merge note above no longer applies.` },
    ]);
  });

  it("refuses to merge processes of two personas, with the reason the dialog shows", async () => {
    const keep = (await make('Guest flow', ['home', 'car'])).process;
    const other = (await make('Client flow', ['home', 'driver'], 'client')).process;
    const r = await call('/processes/merge', { keep: keep.id, absorb: other.id, dry_run: true, author: 'anna' });
    expect(r.status).toBe(409);
    expect(r.body.message).toBe("Processes for different personas can't be merged: compare them instead.");
  });
});
