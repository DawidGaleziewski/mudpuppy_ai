import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPersona } from '@pathfinder/config';
import { migrateUp, openDb, type OpenedDb } from '@pathfinder/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCsv } from '../src/csv.js';
import { runVaultCli, type CliIo } from '../src/index.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
const PORTAL = 'shop';
const MIXIN = 'viewport: { width: 1366, height: 768 }\nlocale: en-GB\nmax_action_class: read\n';
// Obviously fake values (G-28).
const CSV = [
  'persona_id,login,password,tariff,features,contract',
  'anna,anna@example.test,test-pass-anna-not-real,premium,export|share,',
  'bob,bob@example.test,"test-pass-bob,not-real",basic,,B2B',
].join('\n');

let opened: OpenedDb;
let root: string;
let io: CliIo & { lines: string[]; errors: string[] };

beforeEach(() => {
  opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  root = mkdtempSync(join(tmpdir(), 'personas-import-'));
  mkdirSync(join(root, 'portals', PORTAL), { recursive: true });
  writeFileSync(join(root, 'portals', PORTAL, 'portal.yaml'), 'id: shop\n');
  mkdirSync(join(root, 'personas', PORTAL, '_mixins'), { recursive: true });
  writeFileSync(join(root, 'personas', PORTAL, '_mixins/login.yaml'), MIXIN);
  const lines: string[] = [];
  const errors: string[] = [];
  io = {
    db: opened.db,
    keyPath: join(root, 'key'),
    root,
    defaultEnv: 'sandbox',
    out: (l) => lines.push(l),
    err: (l) => errors.push(l),
    readSecret: () => Promise.resolve(''),
    lines,
    errors,
  };
});
afterEach(() => opened.close());

const csvFile = (text: string) => {
  const file = join(root, 'users.csv');
  writeFileSync(file, text);
  return file;
};
const run = (...argv: string[]) => runVaultCli(argv, io);
const persona = (id: string) => join(root, 'personas', PORTAL, `${id}.yaml`);

describe('parseCsv', () => {
  it('reads quoted cells, doubled quotes, CRLF and skips blank lines', () => {
    expect(parseCsv('a,b\r\n"x,1","say ""hi"""\n\n,z\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'say "hi"'],
      ['', 'z'],
    ]);
    expect(() => parseCsv('a\n"open')).toThrow(/line 2/);
  });
});

describe('pnpm personas:import (spec 024 US1.2, US1.3)', () => {
  it('writes one persona per row with refs and attributes, and the values in the vault', async () => {
    expect(await run('import', PORTAL, csvFile(CSV))).toBe(0);
    const anna = loadPersona(persona('anna'));
    expect(anna.auth).toEqual({ login: 'ref:SHOP_ANNA_LOGIN', password: 'ref:SHOP_ANNA_PASSWORD' });
    expect(anna.attributes).toEqual({ tariff: 'premium', features: ['export', 'share'] });
    expect(anna.extends).toEqual(['_mixins/login.yaml']);
    expect(loadPersona(persona('bob')).attributes).toEqual({ tariff: 'basic', contract: 'B2B' });
    expect(await run('reveal', PORTAL, 'SHOP_BOB_PASSWORD', '--yes-print-secret')).toBe(0);
    expect(io.lines.at(-1)).toBe('test-pass-bob,not-real');
  });

  it('never writes or prints a password', async () => {
    await run('import', PORTAL, csvFile(CSV));
    const files = readFileSync(persona('anna'), 'utf8') + readFileSync(persona('bob'), 'utf8');
    for (const secret of ['test-pass-anna-not-real', 'test-pass-bob,not-real']) {
      expect(files).not.toContain(secret);
      expect(io.lines.join('\n')).not.toContain(secret);
    }
    expect(io.lines.at(-1)).toBe('2 created, 0 updated; credentials on sandbox');
  });

  it('a second import updates the same files and rows, keeping keys the file added', async () => {
    await run('import', PORTAL, csvFile(CSV));
    writeFileSync(persona('anna'), `${readFileSync(persona('anna'), 'utf8')}locale: pl-PL\n`);
    expect(await run('import', PORTAL, csvFile(CSV))).toBe(0);
    expect(io.lines.at(-1)).toBe('0 created, 2 updated; credentials on sandbox');
    expect(loadPersona(persona('anna')).locale).toBe('pl-PL');
    expect(await run('list', PORTAL)).toBe(0);
    expect(io.lines.filter((l) => l.startsWith(`${PORTAL}\t`))).toHaveLength(4);
  });

  it('refuses a bad file whole, before writing anything', async () => {
    const bad = 'persona_id,login,password,tariff\nAnna,a,x,basic\nbob,,x,basic\nbob,b,x\n';
    expect(await run('import', PORTAL, csvFile(bad))).toBe(1);
    const msg = io.errors.join('\n');
    expect(msg).toContain('line 2: persona_id must be a lowercase slug');
    expect(msg).toContain('line 3: login and password are required');
    expect(msg).toContain('line 4: persona_id bob repeats');
    expect(msg).toContain('line 4: 3 cells, the header has 4');
    expect([existsSync(persona('anna')), existsSync(persona('bob'))]).toEqual([false, false]);
    expect(await run('import', PORTAL, csvFile('login,persona_id,password\n'))).toBe(1);
    expect(io.errors.at(-1)).toContain('the header must start with persona_id,login,password');
  });

  it('refuses an unknown portal, and a persona with no mixin is put back and named', async () => {
    expect(await run('import', 'nope', csvFile(CSV))).toBe(1);
    expect(io.errors.at(-1)).toContain('unknown portal nope');
    expect(await run('import', PORTAL, csvFile(CSV), '--extends', '../_mixins/missing.yaml')).toBe(
      1,
    );
    expect(io.errors.at(-1)).toContain('persona anna does not load');
    expect(existsSync(persona('anna'))).toBe(false);
  });
});
