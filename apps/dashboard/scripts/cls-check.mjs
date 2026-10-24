// Layout stability check (spec 078, designer T-14, FE-V45): every console page reserves its final
// size before its content arrives, so nothing on screen moves. Against a running dashboard, with
// every /api answer held back 1 s: the cumulative layout shift of a cold load of each page, and of
// each nav click from the first page, must stay at or under 0.05 (Google's "good" is 0.1).
//
//   pnpm --dir apps/dashboard cls:check [--base http://127.0.0.1:8765] [--delay 1000]
//     [--budget 0.05] [--width 1280] [path ...]
//
// Exit 1 when any load or click goes over the budget; the report names the elements that moved.
// `cls:ci` (cls-ci.mjs) imports `measure` and `printReport` to run it unattended on a seeded store.
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

/** Sums the shifts no input caused, and keeps what moved (the designer's Playwright sketch). */
const OBSERVE = () => {
  window.__cls = 0;
  window.__moved = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls += e.value;
      for (const s of e.sources ?? []) {
        const n = s.node;
        if (n && n.nodeType === 1) window.__moved.push(`${n.tagName.toLowerCase()}.${[...n.classList].join('.')}`);
      }
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

const settle = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
};

const read = (page) => page.evaluate(() => ({ cls: window.__cls, moved: [...new Set(window.__moved)].slice(0, 5) }));

async function newPage(browser, { width, delay }) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await page.addInitScript(OBSERVE);
  await page.route('**/api/**', async (route) => {
    await new Promise((f) => setTimeout(f, delay));
    await route.continue();
  });
  return page;
}

/** Measures every path's cold load and every nav click from the first path: `[{what, cls, moved}]`. */
export async function measure({ base, paths, delay = 1000, width = 1280 }) {
  const browser = await chromium.launch();
  const report = [];
  try {
    for (const path of paths) {
      const page = await newPage(browser, { width, delay });
      await page.goto(base + path, { waitUntil: 'commit' });
      await settle(page);
      report.push({ what: `load ${path}`, ...(await read(page)) });
      await page.close();
    }
    // each nav click from the first page: the shift after the click, once its 500 ms input window is over
    const page = await newPage(browser, { width, delay });
    await page.goto(base + paths[0], { waitUntil: 'commit' });
    await settle(page);
    // by place, not address: the links take `?store=` once the store follows the portal
    const count = await page.locator('.sy-nav__item[href]').count();
    for (let i = 0; i < count; i += 1) {
      // each click from the first page (All portals has a nav of its own)
      if (i > 0) {
        await page.goto(base + paths[0], { waitUntil: 'commit' });
        await settle(page);
      }
      const link = page.locator('.sy-nav__item[href]').nth(i);
      const label = (await link.textContent())?.trim() ?? String(i);
      const before = (await read(page)).cls;
      await link.click();
      await settle(page);
      const after = await read(page);
      report.push({ what: `click ${label}`, cls: after.cls - before, moved: after.moved });
    }
  } finally {
    await browser.close();
  }
  return report;
}

/** Prints the report and returns the exit code: 1 when any row is over the budget. */
export function printReport(report, { budget = 0.05, delay = 1000 } = {}) {
  let failed = 0;
  for (const r of report) {
    const over = r.cls > budget;
    if (over) failed += 1;
    console.log(`${over ? 'FAIL' : 'ok  '} ${r.cls.toFixed(3)}  ${r.what}${over && r.moved.length ? `  moved: ${r.moved.join(', ')}` : ''}`);
  }
  console.log(`${String(report.length)} measured, ${String(failed)} over ${String(budget)} (API held back ${String(delay)} ms)`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    if (i === -1) return fallback;
    const [value] = args.splice(i, 2).slice(1);
    return value;
  };
  const base = flag('--base', 'http://127.0.0.1:8765');
  const delay = Number(flag('--delay', '1000'));
  const budget = Number(flag('--budget', '0.05'));
  const width = Number(flag('--width', '1280'));
  const paths = args.length ? args : ['/app/'];
  const report = await measure({ base, paths, delay, width });
  process.exit(printReport(report, { budget, delay }));
}
