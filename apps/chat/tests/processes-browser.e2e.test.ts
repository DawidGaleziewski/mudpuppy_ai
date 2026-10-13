// FE-P02 and FE-P05 end to end (spec 022 M5): in a real browser, a person draws on the to-be
// (add a step, merge two), the draft autosaves, Save makes B r2. Then two people draft on B r2;
// the first save wins, the second gets "Someone saved first", rebases and saves r4. Nothing is
// overwritten: every revision stays with its author.
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProcessService } from '../src/process-service.js';
import { P, seedStates, startStack, type Stack } from './browser-stack.js';

const browser: Browser | null = await chromium.launch().catch(() => null);

let stack: Stack;
let anna: string;
let bob: string;
let variantB: string;

const head = () =>
  (
    stack.opened.raw.prepare('SELECT rev FROM process_variants WHERE id = ?').get(variantB) as {
      rev: number;
    }
  ).rev;
const revision = (rev: number) =>
  stack.opened.raw
    .prepare('SELECT author, steps FROM process_variant_revisions WHERE variant_id = ? AND rev = ?')
    .get(variantB, rev) as { author: string; steps: string };
const titles = (rev: number) =>
  (JSON.parse(revision(rev).steps) as { title: string }[]).map((s) => s.title);
const draftOf = (author: string) =>
  stack.opened.raw
    .prepare('SELECT base_rev, steps FROM process_drafts WHERE variant_id = ? AND author = ?')
    .get(variantB, author) as { base_rev: number; steps: string } | undefined;

async function open(base: string): Promise<Page> {
  const page = await browser!.newPage();
  await page.goto(`${base}/processes/PRC-001?portal=${P}&variant=B`);
  await page.locator('#process-editor').waitFor();
  return page;
}

async function addStep(page: Page, title: string): Promise<void> {
  const form = page.getByRole('form', { name: 'Add a step at the end' });
  await form.getByLabel('New step').fill(title);
  await form.getByLabel('Route').fill(`/${title.toLowerCase()}`);
  await form.getByRole('button', { name: '+ Add step' }).click();
  await page.getByText(title, { exact: true }).waitFor();
}

beforeAll(async () => {
  if (!browser) return;
  stack = await startStack('processes');
  seedStates(stack.opened, [
    ['s-home', '/', 'Home'],
    ['s-car', '/car', 'Car'],
    ['s-driver', '/driver', 'Driver'],
    ['s-options', '/options', 'Options'],
  ]);
  const svc = createProcessService({ db: stack.opened.db });
  const made = await svc.create(P, {
    name: 'Quote',
    persona: 'guest',
    state_ids: ['s-home', 's-car', 's-driver', 's-options'],
    author: 'Anna',
  });
  variantB = (await svc.branch(P, made.process.id, { author: 'Anna' })).variant!.id;
  anna = await stack.dashboard('Anna', `/processes?portal=${P}`);
  bob = await stack.dashboard('Bob', `/processes?portal=${P}`);
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await stack?.close();
});

describe.skipIf(!browser)('drawing the to-be in the browser (FE-P02, FE-P05)', () => {
  it('adds and merges steps as an autosaved draft, then saves B r2', async () => {
    const page = await open(anna);
    await addStep(page, 'Offer');
    expect(draftOf('Anna')).toMatchObject({ base_rev: 1 });
    await page.getByRole('button', { name: 'Merge step 3 with the next' }).click();
    await page.getByText('merges 2 steps').waitFor();
    expect(head()).toBe(1); // nothing saved yet: only the draft changed
    await page.getByRole('button', { name: 'Save as B r2' }).click();
    await page.getByText('No draft open').waitFor();
    expect(head()).toBe(2);
    expect(titles(2)).toEqual(['Home', 'Car', 'Driver', 'Offer']);
    expect(titles(1)).toEqual(['Home', 'Car', 'Driver', 'Options']);
    expect(draftOf('Anna')).toBeUndefined();
    await page.close();
  }, 90_000);

  it('the second save on an old base is refused, kept, rebased and saved as r4', async () => {
    const a = await open(anna);
    const b = await open(bob);
    await addStep(a, 'Login');
    await addStep(b, 'Summary');
    await a.getByRole('button', { name: 'Save as B r3' }).click();
    await a.getByText('No draft open').waitFor();
    expect(head()).toBe(3);

    await b.getByRole('button', { name: 'Save as B r3' }).click();
    await b.getByText('Someone saved first').waitFor();
    expect(head()).toBe(3); // refused: nothing overwritten
    expect(draftOf('Bob')).toMatchObject({ base_rev: 2 });
    await b.getByRole('button', { name: 'Rebase your draft onto r3' }).click();
    await b.getByRole('button', { name: 'Save as B r4' }).click();
    await b.getByText('No draft open').waitFor();

    expect(head()).toBe(4);
    expect(revision(3).author).toBe('Anna');
    expect(revision(4).author).toBe('Bob');
    expect(titles(3)).toContain('Login');
    expect(titles(4)).toContain('Summary');
    await a.close();
    await b.close();
  }, 90_000);
});
