// Spec 072 FR-004 (designer 19/04, `persona.add`): a persona added from a form or a confirmed card
// signs in with a vault credential (its _LOGIN / _PASSWORD pair), never a value; its test data are
// synthetic; Undo removes it while no scan used it. Also the HTTP routes and their statuses.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEffectiveConfig } from '@mudpuppy/config';
import { createApi, listenLocal } from '../src/api.js';
import { addPersona, removePersona } from '../src/persona-add.js';
import { PersonaRefusal } from '../src/personas.js';
import { createPortal } from '../src/portals.js';
import { testService } from './helpers.js';

const repo = join(import.meta.dirname, '..', '..', '..');
const WIKI = { environments: { sandbox: { base_url: 'https://www.wikipedia.org/' } } };
let root: string;
const paths = () => ({ repoRoot: root });
const file = (name: string, portal = 'wikipedia-org') => join(root, 'personas', portal, `${name}.yaml`);
/** A portal with a login block: only there can a persona sign in. */
const RI = 'reference-insurer';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mudpuppy-persona-add-'));
  cpSync(join(repo, 'personas', '_mixins'), join(root, 'personas', '_mixins'), { recursive: true });
  cpSync(join(repo, 'portals', RI), join(root, 'portals', RI), { recursive: true });
  createPortal(paths(), WIKI);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const CLIENT = {
  name: 'client',
  about: 'A signed-in customer with one active policy',
  credential: 'WIKI_CLIENT',
  test_data: [{ field: { route: '/kalkulator', label: 'Kod pocztowy' }, value: '00-950' }],
};

describe('addPersona', () => {
  it('writes a persona that signs in with the credential pair and loads like a run loads it', () => {
    const saved = addPersona(paths(), RI, CLIENT);
    expect(saved.credentialRefs.sort()).toEqual(['WIKI_CLIENT_LOGIN', 'WIKI_CLIENT_PASSWORD']);
    const text = readFileSync(file('client', RI), 'utf8');
    expect(text.startsWith('# A signed-in customer with one active policy')).toBe(true);
    const e = loadEffectiveConfig(join(root, 'portals', RI, 'portal.yaml'), file('client', RI), {
      fence: [join(root, 'personas', '_mixins'), join(root, 'personas', RI)],
    });
    expect(e.persona.auth).toEqual({ login: 'ref:WIKI_CLIENT_LOGIN', password: 'ref:WIKI_CLIENT_PASSWORD' });
    expect(e.persona.test_data).toEqual({ 'Kod pocztowy': '00-950' });
  });

  it('refuses a signed-in persona on a portal without a login', () => {
    expect(() => addPersona(paths(), 'wikipedia-org', CLIENT)).toThrow(/not valid/);
    expect(existsSync(file('client'))).toBe(false);
  });

  it('browses as a guest without a credential', () => {
    addPersona(paths(), 'wikipedia-org', { name: 'reader' });
    expect(readFileSync(file('reader'), 'utf8')).toContain('auth: none');
  });

  it('refuses a bad name, an existing one, a secret-looking credential and personal test data', () => {
    const code = (args: unknown) => {
      try {
        addPersona(paths(), 'wikipedia-org', args);
        return 'saved';
      } catch (error) {
        return error instanceof PersonaRefusal ? error.code : 'other';
      }
    };
    expect(code({ name: 'Klient' })).toBe('INVALID');
    expect(code({ name: 'guest' })).toBe('PERSONA_EXISTS');
    expect(code({ name: 'x1', credential: 'test-key-not-real' })).toBe('INVALID'); // not a vault name
    expect(code({ name: 'x2', test_data: [{ field: { label: 'E-mail' }, value: 'jan.kowalski@gmail.com' }] })).toBe('INVALID');
    expect(existsSync(file('x2'))).toBe(false);
  });
});

describe('removePersona (Undo)', () => {
  it('removes a persona no scan used, and keeps one a scan used', () => {
    const t = testService();
    try {
      addPersona(paths(), 'wikipedia-org', { name: 'reader' });
      expect(removePersona(t.opened.raw, paths(), 'wikipedia-org', 'reader')).toEqual({ portal: 'wikipedia-org', persona: 'reader' });
      expect(existsSync(file('reader'))).toBe(false);
      t.opened.raw
        .prepare(
          `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, started_at)
           VALUES ('run-1', 'wikipedia-org', 'guest', 'map', 'sandbox', 'x', '1280x800', 'pl-PL', 'chromium', '{}', '2026-10-24T00:00:00Z')`,
        )
        .run();
      expect(() => removePersona(t.opened.raw, paths(), 'wikipedia-org', 'guest')).toThrow(/already used/);
    } finally {
      t.service.close();
    }
  });
});

describe('persona routes', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  beforeEach(async () => {
    t = testService();
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-TEST', logged: true }),
      findError: () => Promise.resolve(null),
      version: '1',
      portals: {
        create: () => {
          throw new Error('unused');
        },
        describe: () => {
          throw new Error('unused');
        },
        setEnvironment: () => {
          throw new Error('unused');
        },
        removeEnvironment: () => {
          throw new Error('unused');
        },
        addPersona: (id, body) => addPersona(paths(), id, body),
        removePersona: (id, name) => removePersona(t.opened.raw, paths(), id, name),
      },
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });
  afterEach(async () => {
    t.service.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await t.opened.close();
  });
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  it('adds (201), refuses a second (409) and a bad one (400), undoes (200) and 404s an unknown one', async () => {
    expect((await send('POST', `/portals/${RI}/personas`, CLIENT)).status).toBe(201);
    const again = await send('POST', `/portals/${RI}/personas`, CLIENT);
    expect(again.status).toBe(409);
    expect((await send('POST', `/portals/${RI}/personas`, { name: 'X' })).status).toBe(400);
    const noLogin = await send('POST', '/portals/wikipedia-org/personas', CLIENT);
    expect(noLogin.status).toBe(400);
    expect(((await noLogin.json()) as { message: string }).message).toContain('no login block');
    expect((await send('DELETE', `/portals/${RI}/personas/client`)).status).toBe(200);
    expect((await send('DELETE', `/portals/${RI}/personas/client`)).status).toBe(404);
  });
});
