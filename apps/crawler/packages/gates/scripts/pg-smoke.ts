/**
 * Proving-ground smoke walk (spec 009 T016, quickstart R-25 steps 2–5): shop as guest, bank and
 * insurer logged in, legacy frames, lockout and reset. Usage:
 *   pnpm tsx scripts/pg-smoke.ts [--base http://127.0.0.1:4100] [--shots <dir>]
 * Needs the estate running with users whose password is `--password` (default: the test fixture).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

const arg = (n: string, d: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1]! : d;
};
const base = arg('base', 'http://127.0.0.1:4100');
const shots = arg('shots', '');
const password = arg('password', 'test-password-not-real');
if (shots) mkdirSync(shots, { recursive: true });

const results: { step: string; ok: boolean; note?: string }[] = [];
async function step(name: string, page: Page, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ step: name, ok: true });
  } catch (e) {
    results.push({ step: name, ok: false, note: (e as Error).message.split('\n')[0] });
  }
  if (shots)
    await page.screenshot({ path: join(shots, `${results.length}-${name}.png`), fullPage: true });
}

async function login(page: Page, brand: string, user: string, next: string): Promise<void> {
  await page.goto(`${base}/logowanie?marka=${brand}&next=${encodeURIComponent(next)}`);
  const loginBox = page.locator('input[name=login]');
  await loginBox.fill(user);
  await page.locator('input[name=haslo]').fill(password);
  await page.waitForFunction(
    () => (document.querySelector('input[name=csrf]') as HTMLInputElement)?.value,
  );
  await page.getByRole('button', { name: 'Zaloguj' }).click();
  await page.waitForLoadState('networkidle');
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));

await fetch(`${base}/__admin/reset`, { method: 'POST' });

await step('home', page, async () => {
  await page.goto(base);
  await page.getByText('Mokradło Bank').first().waitFor();
  await page.getByText('Akceptuję wszystkie').waitFor();
});
await step('cookies', page, async () => {
  await page.getByText('Akceptuję wszystkie').click();
  await page.getByText('Akceptuję wszystkie').waitFor({ state: 'detached' });
});
await step('shop-catalog', page, async () => {
  await page.goto(`${base}/sklep`);
  await page.getByText('Następna strona').waitFor({ timeout: 10000 });
});
await step('shop-add-to-cart', page, async () => {
  await page.locator('a[href^="/sklep/produkt/"]').first().click();
  await page.getByText('Dodaj do koszyka').click();
  await page.waitForFunction(
    () => document.querySelector('mk-mini-cart')?.shadowRoot?.textContent?.includes('Koszyk (1)'),
    undefined,
    { timeout: 5000 },
  );
});
await step('shop-cart', page, async () => {
  await page.goto(`${base}/sklep/koszyk`);
  await page.getByText('checkout.summary.vatNote').waitFor({ timeout: 5000 });
});
await step('shop-checkout-captcha', page, async () => {
  await page.goto(`${base}/sklep/zamowienie`);
  await page.locator('.g-recaptcha iframe').waitFor({ timeout: 5000 });
});
await step('bank-guard', page, async () => {
  await page.goto(`${base}/bank/pulpit`);
  if (!page.url().includes('/logowanie')) throw new Error(`not redirected: ${page.url()}`);
});
await step('bank-login', page, async () => {
  await login(page, 'bank', 'jan.testowy', '/bank/pulpit');
  await page.getByText('Konto Osobiste').first().waitFor({ timeout: 5000 });
});
await step('bank-transfer', page, async () => {
  await page.goto(`${base}/bank/przelew`);
  await page.getByPlaceholder('Numer rachunku').waitFor({ timeout: 5000 });
});
await step('bank-statements', page, async () => {
  await page.goto(`${base}/bank/wyciagi?miesiac=2026-02`);
  await page.getByText('Poprzedni miesiąc').waitFor({ timeout: 5000 });
});
await step('bank-legacy-frames', page, async () => {
  await page.goto(`${base}/bank/historia`);
  await page.waitForTimeout(1500);
  const frames = page.frames().map((f) => f.url());
  if (!frames.some((u) => u.includes('lista.do'))) throw new Error(`frames: ${frames.join(' ')}`);
});
await step('insurer-login', page, async () => {
  await login(page, 'insurer', 'ewa.polisowa', '/ubezpieczenia#/polisy');
  await page.getByText(/polis/i).first().waitFor({ timeout: 5000 });
});
await step('insurer-wizard', page, async () => {
  await page.goto(`${base}/ubezpieczenia#/szkody/nowa`);
  await page.getByText('Nie używaj przycisku Wstecz przeglądarki.').waitFor({ timeout: 5000 });
});
await step('redirect-chain', page, async () => {
  await page.goto(`${base}/polisa.php?id=7`);
  await page.waitForURL(/ubezpieczenia#\/polisy\/7/, { timeout: 8000 });
});
await step('lockout-and-reset', page, async () => {
  const other = await (await browser.newContext()).newPage();
  for (let i = 0; i < 3; i++) {
    const c = await (await browser.newContext()).newPage();
    await c.goto(`${base}/logowanie?marka=bank&next=/bank/pulpit`);
    await c.waitForFunction(
      () => (document.querySelector('input[name=csrf]') as HTMLInputElement)?.value,
    );
    await c.locator('input[name=login]').fill('jan.testowy');
    await c.locator('input[name=haslo]').fill('wrong-not-real');
    await c.getByRole('button', { name: 'Zaloguj' }).click();
    await c.waitForLoadState('networkidle');
    if (i === 2) await c.getByText('Konto zostało zablokowane').waitFor({ timeout: 5000 });
  }
  await fetch(`${base}/__admin/reset`, { method: 'POST' });
  await other.close();
});

await browser.close();
for (const r of results)
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.step}${r.note ? ` — ${r.note}` : ''}`);
if (errors.length) console.log(`page errors:\n  ${[...new Set(errors)].join('\n  ')}`);
process.exitCode = results.every((r) => r.ok) && errors.length === 0 ? 0 : 1;
