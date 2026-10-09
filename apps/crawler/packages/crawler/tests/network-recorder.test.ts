import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { NetworkRecorder } from '../src/network-recorder.js';
import { browserAvailable, launch } from './browser.js';

const available = await browserAvailable();

function fakePage() {
  const handlers = new Map<string, ((a: unknown) => void)[]>();
  const page = {
    on: (e: string, f: (a: unknown) => void) => handlers.set(e, [...(handlers.get(e) ?? []), f]),
    off: () => {},
  } as unknown as Page;
  const emit = (e: string, a: unknown) => handlers.get(e)?.forEach((f) => f(a));
  return { page, emit };
}

const response = (text: () => Promise<string>) => ({
  request: () => ({
    resourceType: () => 'fetch',
    method: () => 'GET',
    url: () => 'https://shop.pl/api/poll',
    postData: () => null,
    headers: () => ({}),
  }),
  headers: () => ({ 'content-type': 'application/json' }),
  status: () => 200,
  text,
});

describe('NetworkRecorder body reads', () => {
  it('does not hang drain when a response body never arrives; the call is kept with an unknown shape', async () => {
    const { page, emit } = fakePage();
    const rec = new NetworkRecorder(page, { bodyTimeoutMs: 20 });
    emit(
      'response',
      response(() => new Promise<string>(() => {})),
    );
    emit(
      'response',
      response(async () => '{"ok":true}'),
    );
    const started = Date.now();
    const out = await rec.drain();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(out.calls).toHaveLength(2);
    expect(out.calls.map((c) => c.url_template)).toEqual(['/api/poll', '/api/poll']);
    expect(out.calls[0]!.res_schema).not.toEqual(out.calls[1]!.res_schema);
  });
});

const FORMS = `<!doctype html><title>f</title>
<form id="a" method="post" action="/save"><input name="first" value="x"><input name="second" value="y"><button id="go">go</button></form>
<form id="b" method="post" action="/upload" enctype="multipart/form-data"><input name="note" value="n"><input type="file" name="doc"><button id="up">up</button></form>
<a id="link" href="/plain">plain</a>`;

describe.skipIf(!available)('NetworkRecorder form submits (document requests)', () => {
  let browser: Browser;
  let server: Server;
  let base = '';
  beforeAll(async () => {
    browser = await launch();
    server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (req.url === '/forms') res.end(FORMS);
      else if (req.url === '/save' && req.method === 'POST') {
        req.resume();
        res.statusCode = 302;
        res.setHeader('location', '/save?ok=1');
        res.end();
      } else if (req.method === 'POST') {
        req.resume();
        res.end('<title>uploaded</title>done');
      } else res.end('<title>ok</title>ok');
    }).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  async function submit(selector: string) {
    const page = await browser.newPage();
    await page.goto(`${base}/forms`);
    const rec = new NetworkRecorder(page);
    await rec.drain();
    await page.locator(selector).click();
    await page.waitForLoadState('load');
    const out = await rec.drain();
    rec.dispose();
    await page.close();
    return out.calls;
  }

  it('records a urlencoded POST once with its redirect chain, not the redirected GET', async () => {
    const calls = await submit('#go');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url_template: '/save',
      status: 200,
      req_schema: {
        first: 'string',
        second: 'string',
        content_type: 'application/x-www-form-urlencoded',
      },
      res_schema: { kind: 'document', redirects: [{ status: 302, url_template: '/save' }] },
    });
    expect(JSON.stringify(calls)).not.toContain('"x"');
  });

  it('records a multipart file field as a shape, never its contents', async () => {
    const page = await browser.newPage();
    const rec = new NetworkRecorder(page);
    await rec.ready;
    await page.goto(`${base}/forms`);
    await page.setInputFiles('input[name=doc]', {
      name: 'a.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('FILE-CONTENTS-MARKER'),
    });
    await page.locator('#up').click();
    await page.waitForLoadState('load');
    const { calls } = await rec.drain();
    await page.close();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.req_schema).toEqual({
      note: 'string',
      doc: '<file>',
      content_type: 'multipart/form-data',
    });
    expect(JSON.stringify(calls)).not.toContain('FILE-CONTENTS-MARKER');
  });

  it('records nothing for a plain link navigation', async () => {
    expect(await submit('#link')).toEqual([]);
  });
});
