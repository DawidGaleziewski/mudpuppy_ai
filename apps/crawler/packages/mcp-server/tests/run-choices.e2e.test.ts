import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness } from './harness.js';
import { portalYaml } from './trace-run-harness.js';

/**
 * Spec 011: the BA's per-scan choices end to end in a real browser (skip images, FR-014) and a
 * navigation to an address nothing answers (F-05, F-06).
 */

const available = await canLaunchBrowser();
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

let site: Server;
let origin = '';
const imageHits: string[] = [];
const pageHits: string[] = [];

beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/pic.png') {
      imageHits.push(req.url);
      res.setHeader('content-type', 'image/png');
      return void res.end(Buffer.from('iVBORw0KGgo=', 'base64'));
    }
    if (req.url === '/robots.txt') return void res.writeHead(404).end();
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (req.url?.startsWith('/help/')) pageHits.push(req.url);
    res.end(
      '<!doctype html><title>Strona</title><h1>Strona</h1><img src="/pic.png" alt="logo">' +
        '<a href="/help/faq">Pomoc</a>',
    );
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${String((site.address() as AddressInfo).port)}`;
});
afterAll(async () => new Promise((r) => site?.close(r)));

/** A port nothing listens on: listen, read the port, close. */
async function closedPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
}

async function harness() {
  return startHarness({
    'portals/mock/portal.yaml': portalYaml(origin, 10) + 'robots: ignore\n',
    'personas/mock/guest.yaml': PERSONA,
  });
}

describe.skipIf(!available)('per-scan choices and unreachable addresses (spec 011)', () => {
  it('skip_images: the image is never requested and a decision note says why', async () => {
    const h = await harness();
    try {
      for (const skip of [false, true]) {
        imageHits.length = 0;
        const start = await h.call('start_run', {
          portal_id: 'mock',
          persona_id: 'guest',
          skip_images: skip,
        });
        expect(start.body.skip_images).toBe(skip);
        const page = await h.call('navigate', {
          run_id: start.body.run_id,
          url: `${origin}/`,
          rationale: 'x',
        });
        expect(page.body.error).toBeUndefined();
        expect(imageHits.length > 0).toBe(!skip);
        const notes = h.ctx.raw
          .prepare(
            `SELECT reason FROM decision_log WHERE run_id = ? AND rule = 'choice:skip_images'`,
          )
          .all(start.body.run_id) as { reason: string }[];
        expect(notes.length).toBe(skip ? 1 : 0);
        await h.runtime.closeRun?.(start.body.run_id as string);
        h.ctx.raw
          .prepare(`UPDATE runs SET status = 'interrupted' WHERE id = ?`)
          .run(start.body.run_id);
      }
    } finally {
      await h.cleanup();
    }
  }, 60_000);

  it('focus: an excluded path is refused by navigate and by a link click, and never requested (FR-017)', async () => {
    const h = await harness();
    try {
      pageHits.length = 0;
      const start = await h.call('start_run', {
        portal_id: 'mock',
        persona_id: 'guest',
        focus: { exclude_paths: ['/help/*'] },
      });
      const runId = start.body.run_id as string;
      const direct = await h.call('navigate', {
        run_id: runId,
        url: `${origin}/help/faq`,
        rationale: 'x',
      });
      expect(direct.body.error).toMatchObject({
        code: 'ACTION_REFUSED',
        rule: 'focus.disallowed /help/*',
      });
      const home = await h.call('navigate', { run_id: runId, url: `${origin}/`, rationale: 'x' });
      const link = (
        home.body.actions as { action_id: string; accessible_name: string | null }[]
      ).find((a) => a.accessible_name === 'Pomoc');
      expect(link).toBeDefined();
      const click = await h.call('act', {
        run_id: runId,
        action_id: link!.action_id,
        rationale: 'x',
      });
      expect(JSON.stringify(click.body)).toContain('focus.disallowed /help/*');
      expect(pageHits).toEqual([]);
    } finally {
      await h.cleanup();
    }
  }, 60_000);

  it('navigate to an address nothing answers: NAVIGATION_FAILED, nothing recorded, the server keeps working', async () => {
    const h = await harness();
    try {
      const start = await h.call('start_run', { portal_id: 'mock', persona_id: 'guest' });
      const runId = start.body.run_id as string;
      const down = await h.call('navigate', {
        run_id: runId,
        url: `http://127.0.0.1:${String(await closedPort())}/`,
        rationale: 'x',
      });
      expect(down.body.error).toMatchObject({
        code: 'NAVIGATION_FAILED',
        error: 'net::ERR_CONNECTION_REFUSED',
      });
      expect(h.ctx.raw.prepare('SELECT count(*) AS n FROM states').get()).toEqual({ n: 0 });
      const up = await h.call('navigate', { run_id: runId, url: `${origin}/`, rationale: 'x' });
      expect(up.body).toMatchObject({ title: 'Strona' });
    } finally {
      await h.cleanup();
    }
  }, 60_000);
});
