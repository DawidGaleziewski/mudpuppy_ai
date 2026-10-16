import { rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { dbPathFor, openDb } from '@pathfinder/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { descendants, spawnServer, throwawayRoot } from './spawned-server.js';
import { portalYaml } from './trace-run-harness.js';

/**
 * Spec 010 F-19: the chat service going away closes the pathfinder server's stdin. With a browser
 * open the server used to keep running, with Chromium, forever. It must shut down: close the
 * browser, mark its run interrupted (resumable) and exit.
 */

const available = await canLaunchBrowser();
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
      const root = throwawayRoot('pathfinder-shutdown-', {
        'portals/mock/portal.yaml': portalYaml(origin, 10) + 'robots: ignore\n',
        'personas/mock/guest.yaml': PERSONA,
      });
      let leftovers = (): void => {};
      try {
        const server = await spawnServer(root);
        // A failing run must not leave the server and its Chromium behind.
        leftovers = server.kill;
        const { child, tool } = server;
        const start = await tool('start_run', { portal_id: 'mock', persona_id: 'guest' });
        const runId = start.run_id as string;
        const page = await tool('navigate', { run_id: runId, url: `${origin}/`, rationale: 'x' });
        expect(page.title).toBe('Strona');
        const browser = descendants(server.pid);
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
