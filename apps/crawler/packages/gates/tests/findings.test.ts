import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect } from 'vitest';
import { chromium } from 'playwright';
import { deflateSync } from 'node:zlib';
import { elementKeys, maskText, parseAriaYaml, scrubJson } from '@pathfinder/core';
import { evaluate, readGroundTruth, type EvalRecord } from '@pathfinder/docs';
import { interruptStaleRuns } from '@pathfinder/mcp-server';
import { startReferencePortal, type ReferencePortal } from '@pathfinder/reference-portal';
// Not package exports: the gates pin internals of these packages directly.
import { settleWithDiagnostics, trackNetworkActivity } from '../../crawler/src/stabilizer.js';
import { highlightCrop } from '../../docs/src/render/images.js';
import { withLabel } from '../../docs/src/render/label-box.js';
import { startMockPortal, type MockPortal } from '../../mcp-server/tests/mock-portal.js';
import { CONTENT, startBa } from '../../mcp-server/tests/ba-harness.js';
import {
  gap,
  gate,
  GATE_BASE,
  gateServer,
  REPO,
  type Body,
  type GateServer,
} from '../src/index.js';

/**
 * One case per logged finding mapped `tier: gate` in eval-cases.yaml (spec 009 FR-024, FR-025):
 * the fixed behaviour is pinned with `gate`, an open finding's wanted behaviour with `gap`.
 */

const servers: GateServer[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
  for (const s of servers.splice(0)) await s.close();
});

const GUEST = (max = 'read') =>
  `id: guest\nauth: none\nmax_action_class: ${max}\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n`;

/** A portal config for a local test server (same shape as the mcp-server integration tests). */
const portalYaml = (o: {
  id: string;
  origin: string;
  env?: 'sandbox' | 'production';
  maxDepth?: number;
  extra?: string;
}) => `
id: ${o.id}
base_url: ${o.origin}/
environment: ${o.env ?? 'sandbox'}
compliance:
  robots_checked_on: 2026-10-02
  terms_reviewed_on: 2026-10-02
  terms_reviewed_by: local test server, no terms
scope:
  allowed_domains: [127.0.0.1]
  allowed_paths: ["/*"]
  external_link_policy: record
  max_depth: ${o.maxDepth ?? 6}
  max_states: 100
  max_actions_per_state: 50
  max_run_time_minutes: 5
  max_steps: 80
denylist: [logout, delete, payment, bidding, buy_now, message_or_contact_seller, reveal_seller_contact, "path:/__admin/*"]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (gate)" }
${o.extra ?? ''}
`;

/** A crawler server over the given portal configs (no proving-ground portals). */
async function serverFor(
  files: Record<string, string>,
  env: 'sandbox' | 'production' = 'sandbox',
): Promise<GateServer> {
  const gs = await gateServer({
    portals: [],
    extra: (root) => {
      for (const [rel, c] of Object.entries(files)) {
        mkdirSync(join(root, rel, '..'), { recursive: true });
        writeFileSync(join(root, rel), c);
      }
    },
  });
  gs.ctx.dbEnvironment = env;
  servers.push(gs);
  return gs;
}

const MOCK_ITEMS =
  'item_view_cap: 2\nitem_route_templates: ["/oferta/:id"]\nobstacles:\n  - { id: cookie_banner, selector: "#cookie button.accept" }';

async function mock(maxDepth = 6): Promise<{ gs: GateServer; portal: MockPortal; run: string }> {
  const portal = await startMockPortal();
  closers.push(() => portal.close());
  const gs = await serverFor({
    'portals/mock/portal.yaml': portalYaml({
      id: 'mock',
      origin: portal.origin,
      maxDepth,
      extra: MOCK_ITEMS,
    }),
    'personas/mock/guest.yaml': GUEST(),
  });
  const start = await gs.call('start_run', { portal_id: 'mock', persona_id: 'guest' });
  expect(start.isError, JSON.stringify(start.body)).toBe(false);
  return { gs, portal, run: start.body.run_id as string };
}

async function must(gs: GateServer, name: string, args: Record<string, unknown>): Promise<Body> {
  const r = await gs.call(name, { rationale: 'gate step', include_actions: true, ...args });
  if (r.isError) throw new Error(`${name} refused: ${JSON.stringify(r.body)}`);
  return r.body;
}

const named = (page: Body, name: string): Body => {
  const a = (page.actions as Body[]).find((x) => x.accessible_name === name);
  if (!a) throw new Error(`no action "${name}" on ${page.route_template}`);
  return a;
};

/** Home (depth 1) → Oferty (2); then a home-page action and navigate back home (spec 004 F-01). */
async function depthScenario(): Promise<{ back: Body; actOk: boolean }> {
  const { gs, portal, run } = await mock(2);
  const home = await must(gs, 'navigate', { run_id: run, url: portal.origin + '/' });
  await must(gs, 'act', { run_id: run, action_id: named(home, 'Oferty').action_id });
  // a home-page action is depth 2, wherever the browser is now
  const laptopy = await gs.call('act', {
    run_id: run,
    action_id: named(home, 'Laptopy').action_id,
    rationale: 'gate step',
  });
  expect(laptopy.isError, JSON.stringify(laptopy.body)).toBe(false);
  const back = await must(gs, 'navigate', { run_id: run, url: portal.origin + '/' });
  const again = await gs.call('act', {
    run_id: run,
    action_id: named(back, 'Laptopy').action_id,
    rationale: 'gate step',
  });
  return { back, actOk: !again.isError };
}

gate(
  'F-01@004',
  'depth comes from the action’s state or the URL, not the browser page',
  async () => {
    const { back } = await depthScenario();
    expect(named(back, 'Laptopy').allowed).toBe(true);
  },
);

gate('F-02@004', 'the allowed flag of an issued action equals what act decides', async () => {
  const { back, actOk } = await depthScenario();
  expect(named(back, 'Laptopy').allowed).toBe(actOk);
});

/** home 1 → /oferty 2 → /oferty/laptopy 3 (max_depth 3), then the same listing from home at 2. */
async function shallowerScenario() {
  const { gs, portal, run } = await mock(3);
  const home = await must(gs, 'navigate', { run_id: run, url: portal.origin + '/' });
  const oferty = await must(gs, 'act', { run_id: run, action_id: named(home, 'Oferty').action_id });
  const deep = await must(gs, 'act', {
    run_id: run,
    action_id: named(oferty, 'Laptopy').action_id,
  });
  const deepItem = named(deep, 'Laptop model 2');
  const shallow = await must(gs, 'act', {
    run_id: run,
    action_id: named(home, 'Laptopy').action_id,
  });
  return { gs, run, deepItem, item: named(shallow, 'Laptop model 2') };
}

gate(
  'F-03@004',
  'a shorter path gives a state its shallower depth and reopens its items',
  async () => {
    const { gs, run, deepItem, item } = await shallowerScenario();
    expect(deepItem.allowed).toBe(false);
    expect(item.allowed).toBe(true);
    const row = await gs.ctx.db
      .selectFrom('frontier')
      .select(['status', 'depth'])
      .where('run_id', '=', run)
      .where('action_id', '=', item.action_id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ status: 'pending', depth: 2 });
  },
);

gate(
  'F-05@004',
  'a re-issued action’s stored allowed/skip_reason follows the new decision',
  async () => {
    const { gs, deepItem, item } = await shallowerScenario();
    expect(item.action_id).toBe(deepItem.action_id); // same state, same action row
    const row = gs.ctx.raw
      .prepare('SELECT allowed, skip_reason FROM actions WHERE id = ?')
      .get(item.action_id) as { allowed: number; skip_reason: string | null };
    expect(row).toEqual({ allowed: 1, skip_reason: null });
  },
);

gate('F-04@004', 'a resumed run keeps the depths it had before the interruption', async () => {
  const { gs, portal, run } = await mock(2);
  const home = await must(gs, 'navigate', { run_id: run, url: portal.origin + '/' });
  const oferty = await must(gs, 'act', {
    run_id: run,
    action_id: named(home, 'Oferty').action_id,
  });
  // /oferty is depth 2 = max_depth: its links are refused
  expect(named(oferty, 'Laptop model 1').allowed).toBe(false);
  // crash: the server restarts and marks the run interrupted; resume it
  expect(await interruptStaleRuns(gs.ctx)).toEqual([run]);
  await must(gs, 'start_run', { portal_id: 'mock', persona_id: 'guest', resume_run_id: run });
  const again = await must(gs, 'navigate', { run_id: run, url: portal.origin + '/oferty' });
  expect(named(again, 'Laptop model 1').allowed).toBe(false);
});

/** A chain of ten pages, each with one "Dalej" link to the next. */
async function chainPortal(): Promise<string> {
  const server: Server = createHttpServer((req, res) => {
    const p = req.url ?? '/';
    if (p === '/robots.txt') return void res.end('User-agent: *\nDisallow:\n');
    // Step n lives at /k/s/s… (n segments) and lists n items, so every step is its own route
    // template and state: one template /k/:id would fold the chain into a single shallow state.
    const n = (p.match(/\/s/g) ?? []).length;
    const path = (k: number) => `/k${'/s'.repeat(k)}`;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(
      `<!doctype html><html lang="pl"><head><title>Krok ${n}</title></head><body><main><h1>Krok ${n}</h1>` +
        `<ul>${Array.from({ length: n + 1 }, (_, i) => `<li>Pozycja ${i}</li>`).join('')}</ul>` +
        (n < 9 ? `<a href="${path(n + 1)}">Dalej</a>` : '<p>Koniec procesu</p>') +
        '</main></body></html>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  closers.push(() => new Promise((r) => server.close(() => r())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

gate('F-14@004', 'a trace of a process longer than max_depth reaches its goal', async () => {
  const origin = await chainPortal();
  const gs = await serverFor({
    'portals/chain/portal.yaml': portalYaml({ id: 'chain', origin }),
    'personas/chain/guest.yaml': GUEST(),
  });
  const start = await must(gs, 'start_run', {
    portal_id: 'chain',
    persona_id: 'guest',
    mode: 'trace',
    process: { name: 'Przejdź proces', goal: 'Reach Koniec procesu' },
  });
  const run = start.run_id as string;
  let page = await must(gs, 'navigate', {
    run_id: run,
    url: `${origin}/k`,
    intent: 'Open step 0',
  });
  for (let i = 1; i <= 8; i++) {
    const next = named(page, 'Dalej');
    expect(next.allowed, `step ${i}: ${next.skip_reason}`).toBe(true);
    page = await must(gs, 'act', { run_id: run, action_id: next.action_id, intent: `Step ${i}` });
  }
});

/** A home page whose terms open in pop-up windows: a `target="_blank"` link and `window.open`. */
async function popupPortal(): Promise<string> {
  const page = (title: string, body = '') =>
    `<!doctype html><html lang="pl"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
  const server: Server = createHttpServer((req, res) => {
    const p = req.url ?? '/';
    if (p === '/robots.txt') return void res.end('User-agent: *\nDisallow:\n');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (p === '/warunki') return void res.end(page('Ogólne warunki'));
    if (p === '/regulamin') return void res.end(page('Regulamin'));
    res.end(
      page(
        'Start',
        '<a href="/warunki" target="_blank">Warunki</a>' +
          '<button type="button" onclick="window.open(\'/regulamin\')">Regulamin</button>',
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  closers.push(() => new Promise((r) => server.close(() => r())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

gate('F-04@020', 'a pop-up window that opens a URL is queued and its screen visited', async () => {
  const origin = await popupPortal();
  const gs = await serverFor({
    'portals/popup/portal.yaml': portalYaml({
      id: 'popup',
      origin,
      extra: 'max_action_class: mutating',
    }),
    // The `window.open` button is a script control, classed mutating like any unlabelled button.
    'personas/popup/guest.yaml': GUEST('mutating'),
  });
  const run = (await must(gs, 'start_run', { portal_id: 'popup', persona_id: 'guest' }))
    .run_id as string;
  const home = await must(gs, 'navigate', { run_id: run, url: `${origin}/` });
  for (const name of ['Warunki', 'Regulamin']) {
    const after = await must(gs, 'act', { run_id: run, action_id: named(home, name).action_id });
    expect(after.state_id, `${name}: the opener stays`).toBe(home.state_id);
  }
  const queued = () =>
    gs.ctx.raw
      .prepare(
        `SELECT action_json, status FROM frontier WHERE run_id = ? AND action_id IS NULL
         AND action_json LIKE '{"kind":"navigate"%' ORDER BY action_json`,
      )
      .all(run) as { action_json: string; status: string }[];
  expect(queued()).toEqual([
    {
      action_json: JSON.stringify({ kind: 'navigate', url: `${origin}/regulamin` }),
      status: 'pending',
    },
    {
      action_json: JSON.stringify({ kind: 'navigate', url: `${origin}/warunki` }),
      status: 'pending',
    },
  ]);
  const terms = await must(gs, 'navigate', { run_id: run, url: `${origin}/warunki` });
  expect(terms.title).toBe('Ogólne warunki');
  expect(queued().map((q) => q.status)).toEqual(['pending', 'done']);
});

const REF_PERSONA = `${GUEST()}trace_inputs:\n  Model: Octavia\n`;

async function reference(env: 'sandbox' | 'production', persona = REF_PERSONA) {
  const portal: ReferencePortal = await startReferencePortal({ host: '127.0.0.1', port: 0 });
  closers.push(() => portal.close());
  const origin = portal.url.replace(/\/$/, '');
  const id = env === 'sandbox' ? 'reference-insurer' : 'reference-insurer-readonly';
  const gs = await serverFor(
    {
      [`portals/${id}/portal.yaml`]: portalYaml({ id, origin, env }),
      [`personas/${id}/guest.yaml`]: persona,
    },
    env,
  );
  return { gs, portal, origin, id };
}

gate('F-02@008', 'malformed trace inputs are refused with their error codes', async () => {
  const { gs, origin, id } = await reference('sandbox');
  const code = async (name: string, args: Record<string, unknown>) => {
    const r = await gs.call(name, { rationale: 'gate step', ...args });
    expect(r.isError, `${name} was accepted: ${JSON.stringify(r.body)}`).toBe(true);
    return r.body.error.code as string;
  };
  const PROCESS = { name: 'Oblicz składkę', goal: 'See the premium' };
  expect(await code('start_run', { portal_id: id, persona_id: 'guest', mode: 'trace' })).toBe(
    'SCHEMA_INVALID',
  );
  expect(await code('start_run', { portal_id: id, persona_id: 'guest', process: PROCESS })).toBe(
    'SCHEMA_INVALID',
  );
  expect(
    await code('start_run', {
      portal_id: id,
      persona_id: 'guest',
      mode: 'trace',
      process: PROCESS,
      followup_key: 'FUP-999',
    }),
  ).toBe('UNKNOWN_REF');
  const run = (
    await must(gs, 'start_run', {
      portal_id: id,
      persona_id: 'guest',
      mode: 'trace',
      process: PROCESS,
    })
  ).run_id as string;
  expect(await code('navigate', { run_id: run, url: `${origin}/kalkulator/pojazd` })).toBe(
    'SCHEMA_INVALID',
  );
  expect(await code('finish_run', { run_id: run })).toBe('SCHEMA_INVALID');
});

gate('F-13@008', 'on production map mode fills and sends nothing', async () => {
  const persona = GUEST('external-side-effect');
  const { gs, portal, origin, id } = await reference('production', persona);
  const run = (await must(gs, 'start_run', { portal_id: id, persona_id: 'guest' }))
    .run_id as string;
  const page = await must(gs, 'navigate', { run_id: run, url: `${origin}/kontakt` });
  const r = await gs.call('act', {
    run_id: run,
    action_id: named(page, 'Wyślij zapytanie').action_id,
    rationale: 'gate step',
  });
  // the refusal names its code; an INTERNAL here is the flake of spec 008 F-13
  expect(r.isError).toBe(true);
  expect(r.body.error.code, JSON.stringify(r.body)).toBe('ACTION_REFUSED');
  expect(portal.requests.filter((q) => q.method !== 'GET' && q.method !== 'HEAD')).toEqual([]);
});

gate('F-10@008', 'a navigate settles the pending navigate item for its URL', async () => {
  const { gs, portal, run } = await mock();
  const home = await must(gs, 'navigate', { run_id: run, url: portal.origin + '/' });
  const url = portal.origin + '/oferty';
  const { newId, nowIso } = await import('@pathfinder/core');
  await gs.ctx.db
    .insertInto('frontier')
    .values({
      id: newId(),
      run_id: run,
      state_id: home.state_id as string,
      action_id: null,
      action_json: JSON.stringify({ kind: 'navigate', url }),
      safety_class: 'read',
      status: 'pending',
      priority: 0,
      depth: 1,
      reason: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .execute();
  await must(gs, 'navigate', { run_id: run, url });
  const rows = await gs.ctx.db
    .selectFrom('frontier')
    .select('status')
    .where('run_id', '=', run)
    .where('action_id', 'is', null)
    .where('action_json', '=', JSON.stringify({ kind: 'navigate', url }))
    .execute();
  expect(rows).toEqual([{ status: 'done' }]);
});

gate('F-17@004', 'the depth scenario is stable on repeat and names any server error', async () => {
  for (let i = 0; i < 2; i++) {
    const { back, actOk } = await depthScenario();
    expect(named(back, 'Laptopy').allowed).toBe(true);
    expect(actOk).toBe(true);
  }
});

gate('F-07@008', 'the stabilizer counts a running finite animation it waits on', async () => {
  const browser = await chromium.launch();
  closers.push(() => browser.close());
  const page = await browser.newPage();
  const net = trackNetworkActivity(page);
  await page.setContent(
    '<style>@keyframes f{from{opacity:0}to{opacity:1}} #a{animation:f 5s linear 1}</style><div id="a">x</div>',
  );
  const out = await settleWithDiagnostics(page, net, {
    networkIdleMs: 50,
    domQuietMs: 50,
    timeoutMs: 400,
    pollMs: 20,
  });
  // asserted on what the stabilizer saw, not on wall time
  expect(out.result).toBe('never_stabilized');
  expect(out.diagnostics?.runningAnimations).toBe(1);
});

gate('F-06@008', 'decision details: `name` is redacted, structural keys survive', async () => {
  const out = scrubJson({
    name: 'Rok produkcji',
    field: 'Rok produkcji',
    title: 'Kalkulator',
    label: 'Model',
  });
  expect(out).toEqual({
    name: '[redacted]',
    field: 'Rok produkcji',
    title: 'Kalkulator',
    label: 'Model',
  });
});

gate(
  'F-03@008',
  'masking the YAML text keeps the same element keys as masking each name',
  async () => {
    const names = [
      'Dzień dobry, Anna Nowak',
      'Napisz: jan.kowalski@example.com',
      'Zadzwoń +48 601 234 567',
      'Imię: Jan Kowalski',
      'Karta 4111 1111 1111 1111',
    ];
    // An item as Playwright writes it: a line holding ": " is single-quoted so YAML reads it whole.
    const item = (name: string, i: number) => {
      const line = `button ${JSON.stringify(name)}${i % 2 ? ' [disabled]' : ''}`;
      return /: |#/.test(line) ? `- '${line.replace(/'/g, "''")}'` : `- ${line}`;
    };
    const yaml = names.map(item).join('\n');
    const perName = names.map((n, i) => item(maskText(n), i)).join('\n');
    const keys = (y: string) => elementKeys(parseAriaYaml(y)).map((k) => k.key);
    expect(keys(maskText(yaml))).toEqual(keys(perName));
    expect(keys(maskText(yaml))).toHaveLength(names.length);
  },
);

/** A white RGBA PNG (no image library needed). */
function blankPng(w: number, h: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    t.copy(out, 4);
    out.writeUInt32BE(crc(t), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h, 255);
  for (let y = 0; y < h; y++) raw[y * (w * 4 + 1)] = 0;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

gate('F-12@008', 'a highlight crop of a radio includes the label to its right', async () => {
  // The radio dot at x 100; its label "OC + Autocasco" is a separate element to its right, about
  // 8 px per character at body size. The export widens the region box by the label (spec 020 T007).
  const label = 'OC + Autocasco';
  const box = withLabel({ x: 100, y: 50, width: 16, height: 16 }, 'radio', label, 600);
  const crop = highlightCrop(blankPng(600, 120), [{ n: 1, key: `radio "${label}"`, box }] as never);
  const width = Buffer.from(crop).readUInt32BE(16); // IHDR width
  expect(width).toBeGreaterThanOrEqual(16 + 8 + label.length * 8);
});

gap(
  'F-13@004',
  'a record quoting only the hint example does not earn R11',
  'open: one claim marker is enough to match a rule (spec 004 F-13)',
  async () => {
    const gt = readGroundTruth(
      join(REPO, 'apps/crawler/packages/reference-portal/ground-truth.yaml'),
    );
    const route = gt.screens.find((s) => s.id === 'S11')!.route_template;
    const record: EvalRecord = {
      key: 'BR-029',
      kind: 'business_rule',
      rev: 1,
      confidence: 'observed',
      not_observable: false,
      content: {
        title: 'Discount code',
        statement:
          'The field "Kod rabatowy" accepts a code (hint: np. WIOSNA10); the effect of a code was not observed.',
      },
      evidence: [{ target_kind: 'state', target_id: 'x', routes: [route] }],
    };
    const report = evaluate({
      portal_id: gt.portal_id,
      as_of: '2026-10-05',
      records: [record],
      groundTruth: gt,
    });
    expect(report.scores.rules.matches.R11 ?? []).toEqual([]);
  },
);

gate('F-16@004', 'a revision keeps citations from runs outside the current session', async () => {
  const h = await startBa();
  const s1 = await h.session();
  const created = await h.must('create_record', {
    session_id: s1,
    kind: 'requirement',
    content: CONTENT.requirement,
    confidence: 'observed',
    evidence: [{ target_kind: 'form', target_id: h.fx.forms.vehicle }],
  });
  const other = h.fx.addRun();
  const s2 = await h.session([other.runId]);
  await h.must('revise_record', {
    session_id: s2,
    key: created.key,
    base_rev: 1,
    content: CONTENT.requirement,
    confidence: 'observed',
    evidence: [{ target_kind: 'edge', target_id: other.edgeId }],
    change_note: 'Seen again in a later run.',
  });
  const record = await h.must('get_record', { portal_id: h.fx.portalId, key: created.key });
  const runs = (record.revisions[1].evidence as Body[]).map((e) => e.run_id);
  expect(runs).toContain(h.fx.runId);
  expect(runs).toContain(other.runId);
});

/** A page that renders the CAPTCHA widget server-side, plus the vendor-like anchor frame. */
async function captchaPortal(): Promise<string> {
  const server: Server = createHttpServer((req, res) => {
    const p = req.url ?? '/';
    if (p === '/robots.txt') return void res.end('User-agent: *\nDisallow:\n');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (p.startsWith('/recaptcha/api2/anchor')) return void res.end('<p>Nie jestem robotem</p>');
    if (p === '/kontakt')
      return void res.end(
        '<!doctype html><html lang="pl"><head><title>Kontakt</title></head><body><h1>Kontakt</h1>' +
          '<div class="g-recaptcha" data-sitekey="x"><iframe title="reCAPTCHA" src="/recaptcha/api2/anchor?k=x"></iframe></div>' +
          '<a href="/">Start</a></body></html>',
      );
    res.end(
      '<!doctype html><html lang="pl"><head><title>Start</title></head><body><h1>Start</h1><a href="/kontakt">Kontakt</a></body></html>',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  closers.push(() => new Promise((r) => server.close(() => r())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

gate(
  'F-01@009',
  'a server-rendered CAPTCHA is a hand-off off production and a stop on production',
  async () => {
    const origin = await captchaPortal();
    for (const env of ['sandbox', 'production'] as const) {
      const id = env === 'sandbox' ? 'captcha-sandbox' : 'captcha-production';
      const gs = await serverFor(
        {
          [`portals/${id}/portal.yaml`]: portalYaml({ id, origin, env }),
          [`personas/${id}/guest.yaml`]: GUEST(),
        },
        env,
      );
      const run = (await must(gs, 'start_run', { portal_id: id, persona_id: 'guest' }))
        .run_id as string;
      await must(gs, 'navigate', { run_id: run, url: `${origin}/` });
      const r = await gs.call('navigate', {
        run_id: run,
        url: `${origin}/kontakt`,
        rationale: 'gate step',
      });
      const status = (
        gs.ctx.raw.prepare('SELECT status FROM runs WHERE id = ?').get(run) as { status: string }
      ).status;
      if (env === 'sandbox') {
        expect(r.isError, JSON.stringify(r.body)).toBe(false);
        expect(status).toBe('running');
        const q = gs.ctx.raw
          .prepare(
            "SELECT count(*) AS n FROM open_questions WHERE text LIKE 'Human needed: CAPTCHA on /kontakt%'",
          )
          .get() as { n: number };
        expect(q.n).toBe(1);
      } else {
        expect(r.isError).toBe(true);
        expect(r.body.error.code).toBe('RUN_STOPPED');
        expect(status).toBe('stopped_warning');
      }
    }
  },
);

gate(
  'F-02@009',
  'a full shell page load never trips the rate limiter; a burst of API calls does',
  async () => {
    const gs = await gateServer({ portals: ['proving-ground-shop'] });
    servers.push(gs);
    const run = (
      await must(gs, 'start_run', { portal_id: 'proving-ground-shop', persona_id: 'guest' })
    ).run_id as string;
    const page = await must(gs, 'navigate', { run_id: run, url: `${GATE_BASE}/sklep` });
    expect(page.state_id).toBeTruthy();
    const stops = gs.ctx.raw
      .prepare("SELECT count(*) AS n FROM decision_log WHERE rule = 'block_detected'")
      .get() as { n: number };
    expect(stops.n).toBe(0);
    // one session, 31 API calls back to back (well within a second): the limiter answers 429.
    // Sequential on purpose: the estate's small listen backlog delays a parallel burst past the
    // one-second window (findings, wsgiref backlog).
    const first = await fetch(`${GATE_BASE}/api/clock`);
    const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0]!;
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++)
      statuses.push((await fetch(`${GATE_BASE}/api/clock`, { headers: { cookie } })).status);
    expect(statuses).toContain(429);
  },
);

gate('F-04@009', 'portals/ holds only folders with a portal.yaml', async () => {
  const dir = join(REPO, 'portals');
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    expect(statSync(p).isDirectory(), `${e} is not a folder`).toBe(true);
    expect(existsSync(join(p, 'portal.yaml')), `${e} has no portal.yaml`).toBe(true);
  }
});
