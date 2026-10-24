// R-78 (6), spec 038 FR-001, in a real browser: "Ask the assistant to regroup" on Processes says
// its request in the assistant drawer (the React console since spec 074). Before, the text was lost when the drawer was closed (no assistant wired on the
// page) and dropped without a word when the assistant was busy. Now the chat sends it on arrival,
// or shows it waiting and sends it when the assistant is free.
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { P, T, seedStates, startStack, type Stack } from './browser-stack.js';

const browser: Browser | null = await chromium.launch().catch(() => null);
const CONV = '01a14000-0000-7000-8000-00000000c0a1';
const SAY = 'Cut this portal into processes and suggest groupings';

let stack: Stack;
let base: string;

const said = (role: 'user' | 'assistant') =>
  (
    stack.opened.raw
      .prepare('SELECT content FROM chat_messages WHERE conversation_id = ? AND role = ? ORDER BY seq')
      .all(CONV, role) as { content: string }[]
  ).map((m) => m.content);

async function until(check: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** The React console (R-100; ported in spec 074): the button says it in the assistant drawer. */
async function regroup(): Promise<Page> {
  const page = await browser!.newPage();
  await page.goto(`${base}/app/portals/${P}/processes`);
  await page.getByRole('button', { name: 'Ask the assistant to regroup' }).click();
  await page.getByRole('complementary', { name: 'Assistant' }).waitFor();
  return page;
}

beforeAll(async () => {
  if (!browser) return;
  stack = await startStack('chat-say');
  stack.opened.raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES (?, ?, '', ?, ?)`,
    )
    .run(CONV, P, T, T);
  seedStates(stack.opened, [['s-home', '/', 'Home']]);
  base = await stack.dashboard('Anna', `/api/portals/${P}/processes`);
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await stack?.close();
});

describe.skipIf(!browser)('a request said by a link (R-78 (6))', () => {
  it('is sent by the chat the link opens, with the drawer closed', async () => {
    const page = await regroup();
    await until(() => said('user').includes(SAY));
    await until(() => said('assistant').some((m) => m.includes(`echo: ${SAY}`)));
    await page.close();
  });

  it('waits while the assistant is busy and is sent when it is free', async () => {
    const before = said('user').filter((m) => m === SAY).length;
    // A long turn, as a running scan keeps the assistant busy.
    const busy = await fetch(`${stack.chatBase}/conversations/${CONV}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hang' }),
    });
    expect(busy.status).toBe(202);
    const page = await regroup();
    await page.getByText(`The assistant is busy. This is sent when it finishes: ${SAY}`).waitFor();
    expect(said('user').filter((m) => m === SAY).length).toBe(before);

    await fetch(`${stack.chatBase}/conversations/${CONV}/cancel`, { method: 'POST' });
    await until(() => said('user').filter((m) => m === SAY).length === before + 1);
    await page.close();
  });
});
