// Dashboard UI check (spec 022 T016; FE-Q01, FE-N06, FE-V07, screen acceptance 1–3, 6).
// Against a running dashboard, for every page at 1280 and 390 px
// with reduced motion: a full-page screenshot, no page-level horizontal scroll, one h1, at most
// one primary button and one intent plate, and axe-core with no serious or critical issue.
//
//   pnpm --dir apps/dashboard ui:check [--base http://127.0.0.1:8765] [--out dir]
//     [--widths 1280,390] [path ...]
//
// Exit 1 when any page fails; the report lists each problem.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const base = flag('--base', 'http://127.0.0.1:8765');
const out = flag('--out', 'ui-check');
// Desktop-first pages (2.0, the Workbench) are checked at their own widths: `--widths 1280,1024`.
const WIDTHS = flag('--widths', '1280,390').split(',').map(Number);
const paths = args.length ? args : ['/', '/screens', '/docs', '/activity', '/glossary', '/search?q=a'];

const slug = (p) => p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const report = [];
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const path of paths) {
    errors.length = 0;
    await page.goto(base + path, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const shot = join(out, `${slug(path)}-${width}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const facts = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      // The widest element sticking out of the viewport, to find what causes a page scroll.
      widest: [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
        .slice(-1)[0],
      h1: document.querySelectorAll('h1').length,
      primary: document.querySelectorAll('.sy-btn--primary').length,
      intent: document.querySelectorAll('.sy-plate--intent').length,
    }));
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(async () => {
      // @ts-ignore axe is injected above
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          help: v.help,
          first: v.nodes[0]?.target?.join(' ') ?? '',
        }));
    });
    const problems = [
      ...(facts.overflow ? [`page-level horizontal scroll (${facts.widest})`] : []),
      ...(facts.h1 !== 1 ? [`${facts.h1} h1 elements`] : []),
      ...(facts.primary > 1 ? [`${facts.primary} primary buttons`] : []),
      ...(facts.intent > 1 ? [`${facts.intent} intent plates`] : []),
      ...axe.map((v) => `axe ${v.impact} ${v.id} (${v.nodes}): ${v.help} · first: ${v.first}`),
      ...errors.map((e) => `console: ${e}`),
    ];
    report.push({ path, width, shot, problems });
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${width} ${path}${problems.map((p) => `\n     - ${p}`).join('')}`);
  }
  await page.close();
}
await browser.close();
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
process.exit(report.some((r) => r.problems.length) ? 1 : 0);
