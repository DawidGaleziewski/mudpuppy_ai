import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { evalInPage } from '../src/pw-eval.js';
import { browserAvailable, launch } from './browser.js';

const available = await browserAvailable();
let browser: Browser;
beforeAll(async () => {
  if (available) browser = await launch();
});
afterAll(async () => browser?.close());

describe.skipIf(!available)('evalInPage', () => {
  it("returns the closure's value", async () => {
    const page = await browser.newPage();
    await expect(evalInPage(page, () => 1 + 1)).resolves.toBe(2);
    await page.close();
  });

  it('survives navigation (Playwright resets its isolated evaluate world per document)', async () => {
    const page = await browser.newPage();
    const run = () =>
      evalInPage(page, () => {
        const double = (n: number): number => n * 2;
        return double(21);
      });
    await page.goto('data:text/html,<h1>a</h1>');
    await expect(run()).resolves.toBe(42);
    await page.goto('data:text/html,<h1>b</h1>');
    await expect(run()).resolves.toBe(42);
    await page.close();
  });

  it(
    "evaluates a closure whose (already-transpiled) source references esbuild's __name " +
      'runtime helper, exactly as tsx dev builds emit for a named const/function inside a ' +
      'page.evaluate() body (research: tsx hardcodes esbuild `keepNames: true`, not ' +
      'user-configurable, for stack traces). Built with `new Function` so this reproduces the ' +
      'bug deterministically without depending on tsx actually being the test runner.',
    async () => {
      const page = await browser.newPage();
      const buggy = new Function(
        'return (function () {' +
          ' const nameOf = __name(function (x) { return x + 1; }, "nameOf");' +
          ' return nameOf(41);' +
          '})();',
      ) as () => number;
      // Sanity: this is what plain page.evaluate() does today — the bug this fixes.
      await expect(page.evaluate(buggy)).rejects.toThrow(/__name/);
      await expect(evalInPage(page, buggy)).resolves.toBe(42);
      await page.close();
    },
  );
});
