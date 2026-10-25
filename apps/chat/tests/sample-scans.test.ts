import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateUp, openDb, type OpenedDb } from '@mudpuppy/store';
import { requestSampleScans } from '../src/sample-scans.js';
import { ScanRefusal } from '../src/scan.js';

/** Spec 080 FR-006 (R-98 (4), R-33 US4.2): the reference portal's three personas as a batch. */
const repo = resolve(import.meta.dirname, '../../..');
const CONV = '0199a000-0000-7000-8000-000000000001';
const REFS = [
  'REF_INSURER_KLIENT_LOGIN',
  'REF_INSURER_KLIENT_PASSWORD',
  'REF_INSURER_PREMIUM_LOGIN',
  'REF_INSURER_PREMIUM_PASSWORD',
];

let root: string;
let opened: OpenedDb;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mudpuppy-sample-scans-'));
  for (const dir of ['portals/reference-insurer', 'personas/_mixins', 'personas/reference-insurer'])
    cpSync(join(repo, dir), join(root, dir), { recursive: true });
  opened = openDb(':memory:');
  migrateUp(opened.raw, join(repo, 'data', 'migrations'));
  opened.raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at)
       VALUES (?, NULL, 'test', '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z')`,
    )
    .run(CONV);
});

afterEach(async () => {
  await opened.close();
  rmSync(root, { recursive: true, force: true });
});

const storeCredentials = (refs: readonly string[]) => {
  const insert = opened.raw.prepare(
    `INSERT INTO credentials (id, portal_id, environment, ref_name, ciphertext, nonce, key_id, created_at, updated_at)
     VALUES (?, 'reference-insurer', 'sandbox', ?, x'00', zeroblob(12), 'abcd1234', '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z')`,
  );
  refs.forEach((r, i) => insert.run(`0199a000-0000-7000-8000-0000000000b${String(i)}`, r));
};

const finishedScan = (persona: string, at: string) =>
  opened.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
         locale, browser, config_snapshot, status, started_at)
       VALUES (?, 'reference-insurer', ?, 'map', 'sandbox', '2026-10-25', '1280x800', 'pl-PL',
         'chromium', '{}', 'completed', ?)`,
    )
    .run(`run-${persona}-${at}`, persona, at);

const call = (args: Parameters<typeof requestSampleScans>[3]) =>
  requestSampleScans(opened.raw, { repoRoot: root }, CONV, args);

describe('request_sample_scans', () => {
  it("lists every persona's missing credentials before the first scan", () => {
    let refusal: unknown;
    try {
      call({ portal: 'reference-insurer' });
    } catch (e) {
      refusal = e;
    }
    expect(refusal).toBeInstanceOf(ScanRefusal);
    expect((refusal as ScanRefusal).missing).toEqual([
      'klient: test-user credential REF_INSURER_KLIENT_LOGIN for sandbox',
      'klient: test-user credential REF_INSURER_KLIENT_PASSWORD for sandbox',
      'klient-premium: test-user credential REF_INSURER_PREMIUM_LOGIN for sandbox',
      'klient-premium: test-user credential REF_INSURER_PREMIUM_PASSWORD for sandbox',
    ]);
  });

  it('proposes the sample and hands off one persona after another until complete', () => {
    storeCredentials(REFS);
    const first = call({ portal: 'reference-insurer' });
    expect(first.personas).toEqual(['guest', 'klient', 'klient-premium']);
    expect(first.sample?.pairs).toHaveLength(3); // every pair differs in segment only
    expect(first.next?.persona).toBe('guest');
    expect(first.next?.handoff.agent).toBe('crawler');
    expect(first.complete).toBe(false);

    finishedScan('guest', '2099-01-01T00:00:00.000Z');
    const second = call({
      portal: 'reference-insurer',
      personas: first.personas,
      since: first.since,
    });
    expect(second.done).toEqual(['guest']);
    expect(second.next?.persona).toBe('klient');

    finishedScan('klient', '2099-01-01T00:01:00.000Z');
    finishedScan('klient-premium', '2099-01-01T00:02:00.000Z');
    const last = call({
      portal: 'reference-insurer',
      personas: first.personas,
      since: first.since,
    });
    expect(last).toMatchObject({ complete: true, next: null, remaining: [] });
  });

  it('a scan finished before the batch began does not count', () => {
    storeCredentials(REFS);
    finishedScan('guest', '2026-01-01T00:00:00.000Z');
    const out = call({ portal: 'reference-insurer', personas: ['guest'] });
    expect(out.done).toEqual([]);
    expect(out.next?.persona).toBe('guest');
    expect(out.sample).toBeNull();
  });
});
