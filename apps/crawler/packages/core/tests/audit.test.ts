import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { auditPii, compareRuns } from '../src/audit.js';
import { openDb, type OpenedDb } from '../src/db.js';
import { newId, nowIso } from '../src/ids.js';
import { migrateUp } from '../src/migrate.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
let opened: OpenedDb | undefined;
let dir: string | undefined;
afterEach(async () => {
  await opened?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  opened = undefined;
  dir = undefined;
});

async function seed() {
  opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  const ts = nowIso();
  const run = async () => {
    const id = newId();
    await opened!.db
      .insertInto('runs')
      .values({
        id,
        portal_id: 'p',
        persona_id: 'g',
        mode: 'map',
        environment: 'sandbox',
        env_version_or_date: 'd',
        seed_id: null,
        viewport: 'v',
        locale: 'l',
        browser: 'c',
        config_snapshot: '{"ua":"ops@corp.pl"}',
        status: 'running',
        warning: null,
        steps_used: 0,
        elapsed_ms: 0,
        max_depth_reached: 0,
        started_at: ts,
        ended_at: null,
        coverage: null,
      })
      .execute();
    return id;
  };
  const state = async (runId: string, fp: string, tpl: string, title = 't') => {
    let row = await opened!.db
      .selectFrom('states')
      .select('id')
      .where('fingerprint', '=', fp.repeat(64))
      .executeTakeFirst();
    if (!row) {
      const id = newId();
      await opened!.db
        .insertInto('states')
        .values({
          id,
          portal_id: 'p',
          fingerprint: fp.repeat(64),
          cluster_id: 'c',
          route_template: tpl,
          title,
          evidence_ref: 'a'.repeat(64) + '.yaml',
          confidence: 'observed',
          stabilization: 'settled',
          first_seen_run: runId,
          created_at: ts,
        })
        .execute();
      row = { id };
    }
    await opened!.db
      .insertInto('state_observations')
      .values({
        run_id: runId,
        state_id: row.id,
        persona_id: 'g',
        evidence_ref: 'a'.repeat(64) + '.yaml',
        observed_at: ts,
      })
      .execute();
  };
  return { db: opened.db, run, state, ts };
}

describe('auditPii', () => {
  it('passes clean evidence and rows (the run config snapshot is not scanned)', async () => {
    const { db, run, state } = await seed();
    dir = mkdtempSync(join(tmpdir(), 'pf-audit-'));
    mkdirSync(join(dir, 'ev'));
    writeFileSync(join(dir, 'ev', 'a.yaml'), '- heading "Oferty"\n- text: Cena: [email] [phone]\n');
    await state(await run(), 'a', '/x');
    const r = await auditPii({ evidenceDir: join(dir, 'ev'), db });
    expect(r.findings).toEqual([]);
    expect(r.scanned).toBeGreaterThan(1);
  });

  it('flags unmasked PII in evidence files and DB rows without revealing the value', async () => {
    const { db, run, state } = await seed();
    dir = mkdtempSync(join(tmpdir(), 'pf-audit-'));
    writeFileSync(
      join(dir, 'leak.yaml'),
      '- text: "E-mail: anna@example.com, Telefon: +48 601 234 567"\n',
    );
    await state(await run(), 'b', '/x', 'Witaj, Jan Kowalski');
    const r = await auditPii({ evidenceDir: dir, db });
    const byWhere = Object.fromEntries(r.findings.map((f) => [f.where.split('#')[0], f.kinds]));
    expect(byWhere['evidence/leak.yaml']).toEqual(expect.arrayContaining(['email', 'phone']));
    expect(byWhere['states.title']).toContain('name');
    expect(JSON.stringify(r)).not.toMatch(/anna@example|601 234|Kowalski/);
  });

  it('does not flag our own evidence references, but still flags a real token next to one', async () => {
    const { db, run, state } = await seed();
    dir = mkdtempSync(join(tmpdir(), 'pf-audit-'));
    const ref = `${'ab12'.repeat(16)}.yaml`;
    writeFileSync(join(dir, 'e.json'), JSON.stringify({ snapshot_ref: ref }));
    await state(
      await run(),
      'c',
      '/x',
      `Snapshot ${ref} of ${'cd34'.repeat(16)}, item 01a0d72d-f62e-7003-80d7-4c52c1848616`,
    );
    expect((await auditPii({ evidenceDir: dir, db })).findings).toEqual([]);
    writeFileSync(
      join(dir, 'f.json'),
      JSON.stringify({ snapshot_ref: ref, t: 'Qm7vR2xK9pL4wT8nZ3cH6yB1dF5gJ0sA' }),
    );
    const r = await auditPii({ evidenceDir: dir });
    expect(r.findings.map((f) => f.kinds)).toEqual([['token']]);
  });

  it('tolerates a missing evidence directory', async () => {
    expect((await auditPii({ evidenceDir: '/no/such/dir' })).findings).toEqual([]);
  });
});

describe('compareRuns (SC-005)', () => {
  it('reports the share of matched route templates with identical fingerprints', async () => {
    const { db, run, state } = await seed();
    const a = await run();
    const b = await run();
    for (const [fp, tpl] of [
      ['1', '/'],
      ['2', '/oferty'],
      ['3', '/oferta/:id'],
    ] as const)
      await state(a, fp, tpl);
    for (const [fp, tpl] of [
      ['1', '/'],
      ['2', '/oferty'],
      ['4', '/oferta/:id'],
      ['5', '/only-b'],
    ] as const)
      await state(b, fp, tpl);
    const r = await compareRuns(db, a, b);
    expect(r).toMatchObject({ matched: 3, stable: 2 });
    expect(r.ratio).toBeCloseTo(2 / 3);
    expect(r.unstable).toEqual([{ route_template: '/oferta/:id', only_in_a: 1, only_in_b: 1 }]);
  });

  it('is 1 when nothing matched', async () => {
    const { db, run } = await seed();
    expect((await compareRuns(db, await run(), await run())).ratio).toBe(1);
  });
});
