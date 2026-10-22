import { writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { ConfigError, readTrustedCa } from '@mudpuppy/config';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromiumCaArgs, trustInNode } from '../src/trusted-ca.js';
import { browserAvailable } from './browser.js';
import { makeCaFixture } from '../../../tests/fixtures/ca-fixture.js';

// Spec 031 US4 (R-63, field GC-12): a portal behind a TLS-inspecting proxy names its CA instead of
// ignoring every certificate error.

const ca = makeCaFixture();
const available = ca !== null && (await browserAvailable());

describe.skipIf(ca === null)('readTrustedCa', () => {
  it('reads every certificate of a bundle with its SPKI hash and subject', () => {
    const bundle = join(ca!.dir, 'bundle.pem');
    writeFileSync(bundle, `# corporate bundle\n${ca!.caPem}\n${ca!.leafCert}`);
    const t = readTrustedCa(bundle);
    expect(t.pems).toHaveLength(2);
    expect(t.spki[0]).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(t.spki[0]).not.toBe(t.spki[1]);
    expect(t.subjects[0]).toContain('Test Corp Issuing CA');
  });

  it('names the file and the problem for a missing file, a file without PEM and a bad PEM', () => {
    const empty = join(ca!.dir, 'empty.pem');
    writeFileSync(empty, 'not a certificate');
    const broken = join(ca!.dir, 'broken.pem');
    writeFileSync(broken, '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n');
    expect(() => readTrustedCa(join(ca!.dir, 'nope.pem'))).toThrow(ConfigError);
    expect(() => readTrustedCa(empty)).toThrow(/no PEM certificate/);
    expect(() => readTrustedCa(broken)).toThrow(/certificate 1/);
  });
});

describe.skipIf(!available)('a page behind the CA (browser)', () => {
  let site: Server;
  let url = '';
  beforeAll(async () => {
    // The proxy presents its issuing CA in the chain, as TLS-inspecting proxies do.
    site = createServer({ key: ca!.leafKey, cert: ca!.leafCert + ca!.caPem }, (_q, r) =>
      r.end('<title>Behind the proxy</title>'),
    );
    await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
    url = `https://localhost:${String((site.address() as AddressInfo).port)}/`;
  });
  afterAll(() => site.close());

  const open = async (args: string[]) => {
    const b = await chromium.launch({ args });
    try {
      const p = await b.newPage();
      // Navigations go through `route.fetch` in Node, like the request gate's.
      await p.route('**/*', async (route) => {
        const response = await route.fetch().catch(() => null);
        await (response ? route.fulfill({ response }) : route.abort('failed'));
      });
      return await p
        .goto(url)
        .then(() => p.title())
        .catch((e: Error) => e.message.split('\n')[0]!);
    } finally {
      await b.close();
    }
  };

  it('fails without the CA and opens with it in Node and Chromium', async () => {
    expect(await open([])).toMatch(/net::ERR_FAILED/);
    const trusted = readTrustedCa(ca!.caFile);
    trustInNode(trusted);
    expect(await open(chromiumCaArgs(trusted))).toBe('Behind the proxy');
  }, 60_000);
});
