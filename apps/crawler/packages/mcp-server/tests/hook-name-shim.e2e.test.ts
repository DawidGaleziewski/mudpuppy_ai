import { rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnServer, throwawayRoot } from './spawned-server.js';
import { portalYaml } from './trace-run-harness.js';

/**
 * Spec 030 F-07 / spec 031 T005: under `tsx` (how the chat and Claude Code start the server) a
 * named function inside a hook body is compiled to `function f(){…} __name(f, "f")`, and the page
 * has no `__name`. Vitest's transform does not add it, so only a spawned server shows the field
 * gotcha; the `NAME_SHIM` sent before a hook's `inPage` body must make it work.
 */

const available = await canLaunchBrowser();
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';
const HOOKS_TS = `export const retitle = async (ctx) => {
  await ctx.inPage((n) => {
    function double(x: number): number {
      return x * 2;
    }
    document.title = 'Hooked ' + String(double(n));
  }, 21);
};
`;

let site: Server;
let origin = '';
beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(404).end();
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><title>Strona</title><h1>Strona</h1>');
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${String((site.address() as AddressInfo).port)}`;
});
afterAll(async () => new Promise((r) => site?.close(r)));

describe.skipIf(!available)('hook bodies under tsx (spec 030 F-07)', () => {
  it('a named inner function in an inPage body runs in the page', async () => {
    const root = throwawayRoot('pathfinder-hook-shim-', {
      'portals/mock/portal.yaml':
        portalYaml(origin, 10) + 'robots: ignore\nhooks:\n  - point: onPageLoad\n    fn: retitle\n',
      'portals/mock/hooks.ts': HOOKS_TS,
      'personas/mock/guest.yaml': PERSONA,
    });
    let leftovers = (): void => {};
    try {
      const server = await spawnServer(root);
      leftovers = server.kill;
      const start = await server.tool('start_run', { portal_id: 'mock', persona_id: 'guest' });
      expect(start.run_id).toBeTypeOf('string');
      const page = await server.tool('navigate', {
        run_id: start.run_id,
        url: `${origin}/`,
        rationale: 'x',
      });
      expect(page.title).toBe('Hooked 42');
    } finally {
      leftovers();
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
