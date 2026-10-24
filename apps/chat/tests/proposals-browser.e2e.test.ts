// FE-A04 end to end (spec 022 T026): a person applies the assistant's proposal in the dashboard
// and undoes it, in a real browser against the real dashboard and chat service on one store.
// Apply → a new amendment revision; Undo → another new revision (a restore, never a delete).
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proposeChange } from '../src/proposals.js';
import { P, T, seedStates, startStack, type Stack } from './browser-stack.js';

const CONV = '0199a000-0000-7000-8000-0000000000e2';

const browser: Browser | null = await chromium.launch().catch(() => null);

let stack: Stack;
let dashboardBase: string;
let amendmentId: string;

const revisions = () =>
  stack.opened.raw
    .prepare(
      'SELECT rev, change, author, text FROM amendment_revisions WHERE amendment_id = ? ORDER BY rev',
    )
    .all(amendmentId) as { rev: number; change: string; author: string; text: string }[];

beforeAll(async () => {
  if (!browser) return;
  stack = await startStack('proposals');
  const raw = stack.opened.raw;
  raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES (?, ?, '', ?, ?)`,
    )
    .run(CONV, P, T, T);
  seedStates(stack.opened, [['s-offer', '/oferta', 'Oferta']]);
  const created = await stack.amendments.create(P, {
    kind: 'note',
    target_kind: 'state',
    target_id: 's-offer',
    text: 'Show the price',
    author: 'BA',
  });
  amendmentId = created.id;
  proposeChange(raw, CONV, {
    portal: P,
    summary: 'Say the price includes tax',
    amendment_id: amendmentId,
    text: 'Show the price with tax',
  });
  dashboardBase = await stack.dashboard('Anna', `/api/portals/${P}/review`);
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await stack?.close();
});

describe.skipIf(!browser)('proposals in the browser (FE-A04)', () => {
  it('Apply makes r2 and Undo restores r1 as r3; nothing changes before Apply', async () => {
    // the React console (R-100; ported in spec 074): proposals are decided in Review
    const page = await browser!.newPage();
    await page.goto(`${dashboardBase}/app/portals/${P}/review?show=proposals`);
    const apply = page.getByRole('button', { name: 'Apply as r2' });
    await apply.waitFor();
    expect(revisions().map((r) => r.rev)).toEqual([1]);

    await apply.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
    await page.getByText(/^Applied/).waitFor();
    expect(revisions()).toMatchObject([
      { rev: 1, text: 'Show the price' },
      { rev: 2, author: 'Anna', text: 'Show the price with tax' },
    ]);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByText(/^Undone/).waitFor();
    const after = revisions();
    expect(after).toHaveLength(3);
    expect(after[2]).toMatchObject({ rev: 3, author: 'Anna', text: 'Show the price' });
    await page.close();
  }, 60_000);
});
