// Probe suites (spec 032 US3, owner decision D-2): an open suite is written into traces.yaml only
// when the owner approves it, with the variants they kept and the expectations they changed; the
// owner's comments in the file survive; a decided suite cannot be decided again. Over the real routes.
import type { Server } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTraces } from '@pathfinder/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { createProbeSuiteService } from '../src/probe-suites.js';
import { testService } from './helpers.js';

const P = 'scar-maker';
const T = '2026-10-17T01:00:00.000Z';

const TRACE = {
  id: 'quote',
  name: 'Get a quote',
  goal: 'Reach the summary',
  start_url: '/sc19/apply',
  steps: [{ name: 'Next', kind: 'click', intent: 'press Next' }],
  variants: [
    { id: 'happy-path', expect: 'proceed', steps: [{ name: 'Next', kind: 'click', intent: 'press Next' }] },
    { id: 'quote-500', expect: 'technical_error', fault: 'http_500', probe: 'http-500', steps: [{ name: 'Next', kind: 'click', intent: 'press Next' }] },
    { id: 'no-date', expect: 'validation_error', probe: 'required-empty-one', steps: [{ name: 'Next', kind: 'click', intent: 'press Next' }] },
  ],
};

describe('probe suites wait for the owner', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  let root: string;
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body) }).then(async (r) => ({
      status: r.status,
      body: (await r.json()) as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    }));
  const tracesFile = () => join(root, 'portals', P, 'traces.yaml');

  beforeEach(async () => {
    t = testService();
    root = mkdtempSync(join(tmpdir(), 'pf-suites-'));
    mkdirSync(join(root, 'portals', P), { recursive: true });
    const raw = t.opened.raw;
    raw
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
         VALUES ('run-1', ?, 'quote-tester', 'map', 'sandbox', '2026-10-17', '1366x768', 'en-GB', 'chromium', '{}', 'completed', ?)`,
      )
      .run(P, T);
    for (const id of ['suite-1', 'suite-2'])
      raw
        .prepare(
          `INSERT INTO probe_suites (id, portal_id, run_id, form_step_id, trace_json, notes_json, status, created_at)
           VALUES (?, ?, 'run-1', NULL, ?, '[]', 'open', ?)`,
        )
        .run(id, P, JSON.stringify(TRACE), T);
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-T', logged: true }),
      findError: () => Promise.resolve(null),
      version: 'test',
      probeSuites: createProbeSuiteService({ db: t.opened.db, repoRoot: root }),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });
  afterEach(() => {
    server.close();
  });

  it('writes nothing before approval, then the kept variants with the changed expectation', async () => {
    expect(existsSync(tracesFile())).toBe(false);
    const r = await post(`/portals/${P}/probe-suites/suite-1/approve`, {
      author: 'owner',
      keep: ['happy-path', 'no-date'],
      expect: { 'no-date': 'proceed' },
    });
    expect(r).toMatchObject({ status: 200, body: { status: 'approved', variants: 2, replaced: false } });
    const [trace] = loadTraces(tracesFile());
    expect(trace!.variants.map((v) => [v.id, v.expect])).toEqual([
      ['happy-path', 'proceed'],
      ['no-date', 'proceed'],
    ]);
    const row = t.opened.raw.prepare("SELECT status, decided_by FROM probe_suites WHERE id = 'suite-1'").get();
    expect(row).toEqual({ status: 'approved', decided_by: 'owner' });
    expect((await post(`/portals/${P}/probe-suites/suite-1/approve`, {})).status).toBe(409);
  });

  it('keeps the comments and other traces of the file, and replaces a trace with the same id', async () => {
    writeFileSync(
      tracesFile(),
      '# owner notes stay\ntraces:\n  - id: other\n    name: Other\n    goal: G\n    start_url: /x\n    submit: Go # pressed last\n  - id: quote\n    name: Old quote\n    goal: G\n    start_url: /old\n    submit: Next\n',
    );
    const r = await post(`/portals/${P}/probe-suites/suite-2/approve`, { author: 'owner' });
    expect(r.body).toMatchObject({ replaced: true, variants: 3 });
    const text = readFileSync(tracesFile(), 'utf8');
    expect(text).toContain('# owner notes stay');
    expect(text).toContain('# pressed last');
    expect(loadTraces(tracesFile()).map((x) => [x.id, x.name])).toEqual([
      ['other', 'Other'],
      ['quote', 'Get a quote'],
    ]);
    const row = t.opened.raw.prepare("SELECT replaced_json FROM probe_suites WHERE id = 'suite-2'").get() as {
      replaced_json: string;
    };
    expect(JSON.parse(row.replaced_json)).toMatchObject({ name: 'Old quote' });
  });

  it('keeps an edited suite open (a new variant, changed steps), then approves the edit', async () => {
    const edited = {
      ...TRACE,
      variants: [
        ...TRACE.variants,
        {
          id: 'promo',
          expect: 'validation_error',
          steps: [
            { name: 'Promo code (optional)', kind: 'fill', value: 'NOPE', intent: 'enter a promo' },
            { name: 'Next', kind: 'click', intent: 'press Next' },
          ],
        },
      ],
    };
    const r = await post(`/portals/${P}/probe-suites/suite-1/edit`, { author: 'owner', trace: edited });
    expect(r).toMatchObject({ status: 200, body: { status: 'open', variants: 4 } });
    expect(existsSync(tracesFile())).toBe(false);
    const bad = await post(`/portals/${P}/probe-suites/suite-1/edit`, {
      trace: { ...edited, variants: [edited.variants[0], edited.variants[0]] },
    });
    expect(bad.status).toBe(400);
    expect((await post(`/portals/${P}/probe-suites/suite-1/edit`, { trace: { ...edited, id: 'other' } })).status).toBe(400);
    await post(`/portals/${P}/probe-suites/suite-1/approve`, { author: 'owner' });
    const promo = loadTraces(tracesFile())[0]!.variants.find((v) => v.id === 'promo')!;
    expect(promo.steps?.[0]).toMatchObject({ name: 'Promo code (optional)', value: 'NOPE' });
  });

  it('refuses a change that breaks the trace, and a dismissed suite stays out of the file', async () => {
    const bad = await post(`/portals/${P}/probe-suites/suite-1/approve`, { expect: { 'no-date': 'technical_error' } });
    expect(bad.status).toBe(400);
    expect((await post(`/portals/${P}/probe-suites/suite-1/approve`, { keep: [] })).status).toBe(400);
    expect((await post(`/portals/${P}/probe-suites/suite-1/dismiss`, { author: 'owner' })).body).toEqual({
      id: 'suite-1',
      status: 'dismissed',
    });
    expect(existsSync(tracesFile())).toBe(false);
    expect((await post(`/portals/${P}/probe-suites/missing/dismiss`, {})).status).toBe(404);
  });
});
