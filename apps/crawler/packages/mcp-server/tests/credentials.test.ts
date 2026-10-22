import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newId, nowIso, SECRET_MASK } from '@mudpuppy/core';
import type { PersonaConfig } from '@mudpuppy/config';
import { createVaultStore, loadKey } from '@mudpuppy/vault';
import { resolveRunCredentials, secretValues } from '../src/services/credentials.js';
import { makeCtx } from './helpers.js';

// Field GC-10 / spec 031 T007: a persona named after its login came back as `[secret]` in
// `runs.persona_id`. Credential values stay masked; an id that merely equals one stays readable.

describe('secretValues (GC-10)', () => {
  it('drops a login value equal to a public id and keeps every secret field', () => {
    expect(
      secretValues({ login: 'tester01', password: 'test-pass-not-real' }, ['tester01', 'portal']),
    ).toEqual(['test-pass-not-real']);
    expect(secretValues({ login: 'jan', password: 'tester01' }, ['tester01'])).toEqual([
      'jan',
      'tester01',
    ]);
    expect(secretValues({ api_token: 'portal' }, ['portal'])).toEqual(['portal']);
  });
});

describe('resolveRunCredentials (GC-10)', () => {
  it('a persona whose id equals its login keeps a readable persona_id; the password is masked', async () => {
    const ctx = await makeCtx();
    const keyPath = join(mkdtempSync(join(tmpdir(), 'pf-vault-')), 'key');
    const vault = createVaultStore(ctx.db, loadKey({ path: keyPath, create: true }));
    await vault.set('shop', 'production', 'SHOP_LOGIN', 'tester01');
    await vault.set('shop', 'production', 'SHOP_PASSWORD', 'test-pass-not-real');
    const persona = {
      id: 'tester01',
      auth: { login: 'ref:SHOP_LOGIN', password: 'ref:SHOP_PASSWORD' },
    } as unknown as PersonaConfig;

    await resolveRunCredentials({ ...ctx, vaultKeyPath: keyPath }, 'shop', persona);

    const id = newId();
    await ctx.db
      .insertInto('runs')
      .values({
        id,
        portal_id: 'shop',
        persona_id: 'tester01',
        mode: 'map',
        environment: 'production',
        env_version_or_date: '2026-10-16',
        seed_id: null,
        viewport: '1366x768',
        locale: 'pl-PL',
        browser: 'chromium',
        config_snapshot: JSON.stringify({ note: 'typed test-pass-not-real' }),
        status: 'running',
        warning: null,
        steps_used: 0,
        elapsed_ms: 0,
        max_depth_reached: 0,
        started_at: nowIso(),
        ended_at: null,
        coverage: null,
      })
      .execute();
    const row = ctx.raw
      .prepare('SELECT persona_id, config_snapshot FROM runs WHERE id = ?')
      .get(id) as { persona_id: string; config_snapshot: string };
    expect(row.persona_id).toBe('tester01');
    expect(row.config_snapshot).toContain(SECRET_MASK);
    expect(row.config_snapshot).not.toContain('test-pass-not-real');
  });
});
