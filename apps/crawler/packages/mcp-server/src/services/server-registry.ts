// Running servers per data directory (spec 030 R-61, field GC-22): each server writes
// `data/servers/<pid>.json` (its environment and the checkout it runs from) and removes it on exit.
// A starting server names every live one that serves another environment or comes from another
// checkout, so a call answered by a stray server is never a mystery. Warnings only: several servers
// of one environment are normal (the chat starts one per conversation).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ServerEntry {
  pid: number;
  environment: string;
  /** The checkout the server's code runs from. */
  codeRoot: string;
  server: 'pathfinder' | 'pathfinder-ba';
  startedAt: string;
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** Live entries of the data directory; files of dead processes are removed on the way. */
export function liveServers(dataDir: string): ServerEntry[] {
  const dir = join(dataDir, 'servers');
  if (!existsSync(dir)) return [];
  const out: ServerEntry[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const file = join(dir, f);
    try {
      const e = JSON.parse(readFileSync(file, 'utf8')) as ServerEntry;
      if (alive(e.pid)) out.push(e);
      else rmSync(file, { force: true });
    } catch {
      rmSync(file, { force: true });
    }
  }
  return out;
}

/** Why each live server is suspicious next to `me`; empty when all agree. */
export function strayWarnings(me: ServerEntry, others: readonly ServerEntry[]): string[] {
  return others
    .filter((o) => o.pid !== me.pid)
    .flatMap((o) => [
      ...(o.environment !== me.environment
        ? [
            `${o.server} pid ${String(o.pid)} serves environment "${o.environment}", this one "${me.environment}"`,
          ]
        : []),
      ...(o.codeRoot !== me.codeRoot
        ? [`${o.server} pid ${String(o.pid)} runs from another checkout (${o.codeRoot})`]
        : []),
    ]);
}

/** Register this server; returns the warnings about others and the unregister function. */
export function registerServer(
  dataDir: string,
  me: ServerEntry,
): { warnings: string[]; unregister: () => void } {
  const warnings = strayWarnings(me, liveServers(dataDir));
  const dir = join(dataDir, 'servers');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${String(me.pid)}.json`);
  writeFileSync(file, `${JSON.stringify(me)}\n`);
  return { warnings, unregister: () => rmSync(file, { force: true }) };
}
