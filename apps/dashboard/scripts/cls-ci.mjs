// Layout stability check, unattended (spec 079 FR-006, R-106 (7)): `cls:check` on every console
// route against a dashboard of its own.
//
//   pnpm --dir apps/dashboard cls:ci [--delay 1000] [--budget 0.05] [--width 1280]
//
// 1. builds apps/web when its dist is missing or older than its src;
// 2. seeds a temp data dir from the dashboard tests' fixtures (scripts/cls_seed.py);
// 3. starts the dashboard on a free port (never 8765, 4200, 4201, 4310, 4400) and waits for it;
// 4. measures every route with cls-check's `measure` (API held back, budget as in cls:check);
// 5. stops the process group it started, removes the temp dir, exits with cls-check's code.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { measure, printReport } from './cls-check.mjs';

const dashboardDir = resolve(import.meta.dirname, '..');
const webDir = resolve(dashboardDir, '../web');
const RESERVED = new Set([8765, 4200, 4201, 4310, 4400]);

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const delay = Number(flag('--delay', '1000'));
const budget = Number(flag('--budget', '0.05'));
const width = Number(flag('--width', '1280'));

/** The newest modification time under a folder (files only). */
function newest(dir) {
  let latest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    latest = Math.max(latest, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
  }
  return latest;
}

function buildWebIfStale() {
  const index = join(webDir, 'dist', 'index.html');
  if (existsSync(index) && statSync(index).mtimeMs >= newest(join(webDir, 'src'))) {
    console.log('apps/web/dist is current, no build');
    return;
  }
  console.log('building apps/web ...');
  const built = spawnSync('pnpm', ['--dir', webDir, 'build'], { stdio: 'inherit' });
  if (built.status !== 0) throw new Error('pnpm --dir apps/web build failed');
}

/** A free local port that is none of the ones other tools own. */
async function freePort() {
  for (;;) {
    const port = await new Promise((done, fail) => {
      const probe = createServer();
      probe.once('error', fail);
      probe.listen(0, '127.0.0.1', () => {
        const { port: p } = probe.address();
        probe.close(() => done(p));
      });
    });
    if (!RESERVED.has(port)) return port;
  }
}

async function waitUp(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await fetch(url)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`not up: ${url}`);
}

/** Every console route (apps/web/src/app/App.tsx) with the seeded ids filled in, home first. */
function routes({ docs, procs }) {
  const d = `/app/portals/${docs.portal}`;
  const p = `/app/portals/${procs.portal}`;
  const px = `?store=${procs.env}`;
  return [
    '/app/',
    '/app/portals/new',
    '/app/glossary',
    '/app/glossary/wiki',
    '/app/search?q=a',
    d,
    `${d}/changes`,
    `${d}/docs`,
    `${d}/docs/${docs.records[0]}`,
    `${d}/docs/sessions/${docs.sessions[0]}`,
    `${d}/review`,
    `${d}/rules`,
    `${d}/same-screen`,
    `${d}/scans`,
    `${d}/scans/plan`,
    `${d}/scans/by-process`,
    `${d}/scans/activity`,
    `${d}/settings`,
    `${d}/screens`,
    `${d}/screens/map`,
    `${d}/screens/recorded`,
    `${d}/screens/access`,
    `${d}/processes`,
    `${d}/workbench`,
    `${d}/workbench/live`,
    `/app/scans/${docs.run}`,
    `/app/scans/${docs.run}/states`,
    `/app/scans/${docs.run}/trace`,
    `/app/states/${docs.state}`,
    `${p}/processes${px}`,
    `${p}/processes/loose${px}`,
    `${p}/processes/${procs.process}${px}`,
    `${p}/processes/${procs.process}/compare${px}`,
    `${p}/processes/${procs.process}/history${px}`,
    `${p}/processes/${procs.process}/documentation${px}`,
  ];
}

const root = mkdtempSync(join(tmpdir(), 'mudpuppy-cls-'));
let child;
let code = 1;
try {
  buildWebIfStale();
  const dataDir = join(root, 'data');
  const seeded = spawnSync('uv', ['run', '--quiet', 'python', 'scripts/cls_seed.py', dataDir], {
    cwd: dashboardDir,
    encoding: 'utf8',
  });
  if (seeded.status !== 0) throw new Error(`seeding failed:\n${seeded.stderr}`);
  const ids = JSON.parse(seeded.stdout.trim().split('\n').pop());

  const port = await freePort();
  // its own process group, so the stop below reaches `uv` and the Python server it starts, and no one else
  child = spawn('uv', ['run', '--quiet', 'mudpuppy-dashboard'], {
    cwd: dashboardDir,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MUDPUPPY_DATA_DIR: dataDir,
      MUDPUPPY_DEFAULT_ENV: ids.docs.env,
      MUDPUPPY_PORT: String(port),
      MUDPUPPY_CHAT_URL: 'http://127.0.0.1:1', // no chat service: never the real one on 4310
      MUDPUPPY_EVAL_ROOT: join(root, 'no-evals'),
      MUDPUPPY_REVIEWER: 'cls-ci',
    },
  });
  const base = `http://127.0.0.1:${String(port)}`;
  await waitUp(`${base}/app/`);
  console.log(`dashboard pid ${String(child.pid)} on ${base}, data ${dataDir}`);

  const report = await measure({ base, paths: routes(ids), delay, width });
  code = printReport(report, { budget, delay });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM'); // the group this script created
    } catch {
      /* already gone */
    }
  }
  rmSync(root, { recursive: true, force: true });
}
process.exit(code);
