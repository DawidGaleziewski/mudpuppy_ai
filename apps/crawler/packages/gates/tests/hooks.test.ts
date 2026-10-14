import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import {
  actionNamed,
  gate,
  gateServer,
  GATE_BASE,
  nav,
  resetEstate,
  rows,
  snapshot,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * Portal hooks and URL lists (spec 023 SC-001..SC-003, SC-005) on the proving ground's
 * `/__test/hook-gate`, which opens only with the consent cookie and a window patch.
 */
const SHOP = 'proving-ground-shop';

const HOOKS_TS = `// Written by the gate (spec 023): the consent cookie and a window patch before any page.
export const openGate = async (ctx) => {
  await ctx.cookies.add([{ name: 'pg_hook_consent', value: '1', url: ctx.config.base_url }]);
  await ctx.addInitScript('window.__pgPatched = true;');
};
export const boom = () => {
  throw new Error('boom');
};
`;

/** A copy of the shop's config: `edit` changes the YAML; `hooks` writes hooks.ts too. */
function shop(edit: (yaml: string) => string, hooks = false) {
  return (root: string) => {
    const file = join(root, 'portals', SHOP, 'portal.yaml');
    writeFileSync(file, edit(readFileSync(file, 'utf8')));
    if (hooks) writeFileSync(join(root, 'portals', SHOP, 'hooks.ts'), HOOKS_TS);
  };
}

const allowGate = (yaml: string) =>
  yaml.replace('  allowed: [', '  allowed: ["/__test/hook-gate", "/__test/hooks/*", ');

const frontierOf = (gs: GateServer, run: string, part: string) =>
  rows<{ status: string; reason: string | null }>(
    gs,
    'SELECT status, reason FROM frontier WHERE run_id = ? AND action_json LIKE ?',
    run,
    `%${part}%`,
  );

let hooked: GateServer;
let plain: GateServer;
let narrow: GateServer;
let hookedRun: string;

beforeAll(async () => {
  await resetEstate();
  hooked = await gateServer({
    portals: [SHOP],
    extra: shop(
      (y) =>
        `${allowGate(y).replace('  disallowed:\n', "  disallowed:\n    - '/\\/polisa\\/\\d+\\/druk/'\n")}` +
        'hooks:\n  - point: onRunStart\n    fn: openGate\n' +
        '  - point: onPageLoad\n    fn: boom\n    match: "/__test/*"\n',
      true,
    ),
  });
  plain = await gateServer({ portals: [SHOP], extra: shop(allowGate) });
  narrow = await gateServer({
    portals: [SHOP],
    extra: shop((y) =>
      y.replace(
        / {2}allowed: \[.*\]/,
        '  allowed: ["/__test/hook-gate", "/__test/hooks/sekcja/*"]',
      ),
    ),
  });
  hookedRun = await startRun(hooked.call, SHOP, 'guest');
});
afterAll(async () => {
  await hooked?.close();
  await plain?.close();
  await narrow?.close();
});

gate(
  'F-01@023',
  'a page that needs a cookie and a script patch opens with a portal hook',
  async () => {
    const open = await nav(hooked.call, hookedRun, '/__test/hook-gate');
    expect(snapshot(hooked, open.state_id)).toContain('Strona otwarta');
    expect(actionNamed(open, 'Dalej')).toBeDefined();
    const without = await startRun(plain.call, SHOP, 'guest');
    const closed = await nav(plain.call, without, '/__test/hook-gate');
    expect(snapshot(plain, closed.state_id)).toContain('Brak zgody');
    expect(actionNamed(closed, 'Dalej')).toBeUndefined();
  },
);

gate(
  'F-02@023',
  'a disallowed regex URL is never opened, the link is skipped with the rule',
  async () => {
    await nav(hooked.call, hookedRun, '/__test/hook-gate');
    const print = frontierOf(hooked, hookedRun, '/polisa/123/druk');
    expect(print.length).toBeGreaterThan(0);
    for (const item of print) {
      expect(item.status).toBe('out_of_scope');
      expect(item.reason).toContain('excluded by rule');
    }
    const direct = await hooked.call('navigate', {
      run_id: hookedRun,
      url: `${GATE_BASE}/__test/hooks/polisa/123/druk`,
      rationale: 'gate step',
    });
    expect(direct.isError).toBe(true);
    expect(
      rows(hooked, "SELECT 1 FROM page_visits WHERE run_id = ? AND url LIKE '%/druk%'", hookedRun),
    ).toEqual([]);
  },
);

gate('F-03@023', 'urls.allowed limits a scan to one section', async () => {
  const run = await startRun(narrow.call, SHOP, 'guest');
  await nav(narrow.call, run, '/__test/hook-gate');
  expect(frontierOf(narrow, run, '/sekcja/a').map((f) => f.status)).toContain('pending');
  for (const part of ['/poza/b', '/polisa/123/druk'])
    for (const item of frontierOf(narrow, run, part)) {
      expect(item.status).toBe('out_of_scope');
      expect(item.reason).toContain('urls.allowed');
    }
  const shopPage = await narrow.call('navigate', {
    run_id: run,
    url: `${GATE_BASE}/sklep`,
    rationale: 'gate step',
  });
  expect(shopPage.isError).toBe(true);
});

gate('F-04@023', 'a throwing hook leaves the run going with the failure recorded', async () => {
  await nav(hooked.call, hookedRun, '/__test/hook-gate');
  const notes = rows<{ reason: string }>(
    hooked,
    "SELECT reason FROM decision_log WHERE run_id = ? AND rule = 'hook:onPageLoad:boom'",
    hookedRun,
  );
  expect(notes.length).toBeGreaterThan(0);
  expect(notes.every((n) => n.reason.startsWith('failed: boom'))).toBe(true);
  expect(
    rows<{ status: string }>(hooked, 'SELECT status FROM runs WHERE id = ?', hookedRun)[0]?.status,
  ).toBe('running');
});
