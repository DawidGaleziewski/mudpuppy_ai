/**
 * The MudPuppy 2.0 data reset (spec 039 plan § 2, T002).
 * Usage: pnpm store:reset [--confirm] [--root <repo root>]
 * Without --confirm it only prints what would be deleted and moved. Refuses (exit 1) while a
 * process holds a file under data/db open or a Pathfinder service port answers.
 */
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  StoreResetRefused,
  answeringPorts,
  applyStoreReset,
  openHolders,
  planStoreReset,
} from '@pathfinder/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
/** Where the Pathfinder services listen (CLAUDE.md: proving ground, scar-maker, chat, dashboard). */
const SERVICE_PORTS = [
  { host: '127.0.0.1', port: 4200 },
  { host: '127.0.0.1', port: 4201 },
  { host: '127.0.0.1', port: 4310 },
  { host: '127.0.0.1', port: 4400 },
  { host: '127.0.0.2', port: 4400 },
  { host: '127.0.0.1', port: 8765 },
];
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const dataDir = join(root, 'data');
const plan = planStoreReset(dataDir);
const mb = (b: number) => (b / 1_048_576).toFixed(1);
const blockers = [
  ...openHolders(join(dataDir, 'db')).map((h) => `pid ${h.pid} holds data/db open: ${h.cmd}`),
  ...(await answeringPorts(SERVICE_PORTS)).map((p) => `a service answers on ${p}`),
];
const confirm = process.argv.includes('--confirm');
console.log(confirm ? 'store reset:' : 'store reset (dry run, add --confirm):');
for (const d of plan.deletes)
  console.log(`  delete ${d.path.slice(root.length + 1)} (${mb(d.bytes)} MB)`);
console.log(`  move ${plan.moves.length} v1 eval files into history/v1/`);
for (const b of blockers) console.log(`  BLOCKED: ${b}`);
if (confirm) {
  try {
    const gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root })
      .toString()
      .trim();
    applyStoreReset(plan, { blockers, gitSha, now: new Date().toISOString() });
    console.log('done: see data/RESET-v2.md');
  } catch (e) {
    if (!(e instanceof StoreResetRefused)) throw e;
    console.error(e.message);
    process.exitCode = 1;
  }
}
