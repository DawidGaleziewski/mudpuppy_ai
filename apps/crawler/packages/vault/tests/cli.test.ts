import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateUp, openDb, type OpenedDb } from '@pathfinder/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runVaultCli, type CliIo } from '../src/index.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
const VALUE = 'test-password-not-real';

let opened: OpenedDb;
let io: CliIo & { lines: string[]; errors: string[] };
let dir: string;

beforeEach(() => {
  opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  dir = mkdtempSync(join(tmpdir(), 'vault-cli-'));
  const lines: string[] = [];
  const errors: string[] = [];
  io = {
    db: opened.db,
    keyPath: join(dir, 'key'),
    root: dir,
    defaultEnv: 'sandbox',
    out: (l) => lines.push(l),
    err: (l) => errors.push(l),
    readSecret: async () => VALUE,
    lines,
    errors,
  };
});
afterEach(() => opened.close());

const run = (...argv: string[]) => runVaultCli(argv, io);

describe('pnpm vault', () => {
  it('set → list never prints the value; reveal needs the explicit flag', async () => {
    expect(await run('set', 'proving-ground-bank', 'PG_BANK_PASSWORD')).toBe(0);
    expect(await run('list')).toBe(0);
    expect(io.lines.join('\n')).toContain('proving-ground-bank\tsandbox\tPG_BANK_PASSWORD');
    expect(io.lines.join('\n')).not.toContain(VALUE);
    expect(await run('reveal', 'proving-ground-bank', 'PG_BANK_PASSWORD')).toBe(2);
    expect(
      await run('reveal', 'proving-ground-bank', 'PG_BANK_PASSWORD', '--yes-print-secret'),
    ).toBe(0);
    expect(io.lines.at(-1)).toBe(VALUE);
  });

  it('list without a key fails closed and names the key path', async () => {
    expect(await run('list')).toBe(1);
    expect(io.errors[0]).toContain(join(dir, 'key'));
  });

  it('delete reports a missing row', async () => {
    await run('set', 'p', 'R');
    expect(await run('delete', 'p', 'R')).toBe(0);
    expect(await run('delete', 'p', 'R')).toBe(1);
  });

  it('generate stores both refs and seeds a Django hash, never the password', async () => {
    const seed = join(dir, 'var', 'users.local.json');
    expect(
      await run(
        'generate',
        'proving-ground-bank',
        '--login',
        'PG_BANK_LOGIN=jan.testowy',
        '--password',
        'PG_BANK_PASSWORD',
        '--seed',
        seed,
        '--seed-user',
        'bank-client',
        '--iterations',
        '1000',
      ),
    ).toBe(0);
    const doc = JSON.parse(readFileSync(seed, 'utf8'));
    expect(doc.users).toEqual([
      expect.objectContaining({ id: 'bank-client', brand: 'bank', login: 'jan.testowy' }),
    ]);
    expect(doc.users[0].hash).toMatch(/^pbkdf2_sha256\$1000\$/);
    await run('reveal', 'proving-ground-bank', 'PG_BANK_PASSWORD', '--yes-print-secret');
    const password = io.lines.at(-1)!;
    expect(password).toHaveLength(24);
    expect(readFileSync(seed, 'utf8')).not.toContain(password);
    expect(io.lines.slice(0, -1).join('\n')).not.toContain(password);
  });

  it('check resolves every persona ref', async () => {
    mkdirSync(join(dir, 'personas', 'pg'), { recursive: true });
    writeFileSync(
      join(dir, 'personas', 'pg', 'client.yaml'),
      'id: client\nlocale: pl-PL\nviewport: { width: 1280, height: 800 }\nmax_action_class: read\nauth:\n  login: ref:PG_L\n  password: ref:PG_P\n',
    );
    await run('set', 'pg', 'PG_L');
    expect(await run('check', 'pg', 'client')).toBe(1);
    expect(io.errors.at(-1)).toContain('PG_P');
    await run('set', 'pg', 'PG_P');
    expect(await run('check', 'pg', 'client')).toBe(0);
  });

  it('rejects an unknown environment and prints usage for unknown commands', async () => {
    expect(await run('list', '--env', 'prod')).toBe(2);
    expect(await run('frobnicate')).toBe(2);
    expect(io.errors.at(-1)).toContain('usage:');
  });
});
