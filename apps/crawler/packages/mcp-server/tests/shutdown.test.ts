import { spawn } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { dbPathFor, openDb } from '@pathfinder/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { portalYaml } from './trace-run-harness.js';

/**
 * Spec 010 F-19: the chat service going away closes the pathfinder server's stdin. With a browser
 * open the server used to keep running, with Chromium, forever. It must shut down: close the
 * browser, mark its run interrupted (resumable) and exit.
 */

const available = await canLaunchBrowser();
const PKG = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

let site: Server;
let origin = '';
beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(404).end();
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><title>Strona</title><h1>Strona</h1><a href="/a">A</a>');
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${String((site.address() as AddressInfo).port)}`;
});
afterAll(async () => new Promise((r) => site?.close(r)));

/** Live descendants of a process (Linux /proc), so Chromium can be seen going away. */
function descendants(pid: number): number[] {
  const parent = new Map<number, number>();
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      parent.set(Number(name), ppid);
    } catch {
      // gone meanwhile
    }
  }
  const out: number[] = [];
  const walk = (p: number) => {
    for (const [child, pp] of parent) {
      if (pp !== p) continue;
      out.push(child);
      walk(child);
    }
  };
  walk(pid);
  return out;
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function until(check: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return check();
}

describe.skipIf(!available || process.platform !== 'linux')(
  'pathfinder server shutdown (spec 010 F-19)',
  () => {
    it('stdin closing with a browser open: browser closed, run interrupted, process gone', async () => {
      const root = mkdtempSync(join(tmpdir(), 'pathfinder-shutdown-'));
      let leftovers = (): void => {};
      try {
        cpSync(MIGRATIONS, join(root, 'data', 'migrations'), { recursive: true });
        for (const [rel, c] of Object.entries({
          'portals/mock/portal.yaml': portalYaml(origin, 10) + 'robots: ignore\n',
          'personas/mock/guest.yaml': PERSONA,
        })) {
          mkdirSync(dirname(join(root, rel)), { recursive: true });
          writeFileSync(join(root, rel), c);
        }
        const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
          cwd: PKG,
          env: { ...process.env, PATHFINDER_ROOT: root, PATHFINDER_ENV: 'sandbox' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // A failing run must not leave the server and its Chromium behind.
        leftovers = () => {
          for (const p of [...descendants(child.pid!), child.pid!])
            try {
              process.kill(p, 'SIGKILL');
            } catch {
              // already gone
            }
        };
        child.stderr.resume();
        const pending = new Map<number, (v: Record<string, unknown>) => void>();
        let buf = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (d: string) => {
          buf += d;
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            const msg = JSON.parse(line) as { id?: number; result?: Record<string, unknown> };
            if (msg.id !== undefined) pending.get(msg.id)?.(msg.result ?? {});
          }
        });
        let seq = 0;
        const rpc = (method: string, params: unknown) =>
          new Promise<Record<string, unknown>>((resolve) => {
            seq += 1;
            pending.set(seq, resolve);
            child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: seq, method, params })}\n`);
          });
        const tool = async (name: string, args: Record<string, unknown>) =>
          (await rpc('tools/call', { name, arguments: args })).structuredContent as Record<
            string,
            unknown
          >;
        await rpc('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        });
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
        );
        const start = await tool('start_run', { portal_id: 'mock', persona_id: 'guest' });
        const runId = start.run_id as string;
        const page = await tool('navigate', { run_id: runId, url: `${origin}/`, rationale: 'x' });
        expect(page.title).toBe('Strona');
        const browser = descendants(child.pid!);
        expect(browser.length).toBeGreaterThan(0);

        child.stdin.end();
        expect(await until(() => child.exitCode !== null, 15_000)).toBe(true);
        expect(child.exitCode).toBe(0);
        expect(await until(() => browser.every((p) => !alive(p)), 5_000)).toBe(true);
        const db = openDb(dbPathFor(join(root, 'data'), 'sandbox'));
        try {
          expect(db.raw.prepare('SELECT status FROM runs WHERE id = ?').get(runId)).toEqual({
            status: 'interrupted',
          });
        } finally {
          await db.close();
        }
      } finally {
        leftovers();
        rmSync(root, { recursive: true, force: true });
      }
    }, 60_000);
  },
);
