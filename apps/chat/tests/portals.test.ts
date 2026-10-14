// Spec 011 (FR-004, FR-005, FR-008, FR-011, FR-012): portals added and changed from the dashboard.

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEffectiveConfig } from '@pathfinder/config';
import { createApi, listenLocal } from '../src/api.js';
import {
  PortalRefusal,
  createPortal,
  describePortal,
  proposeId,
  removeEnvironment,
  setEnvironment,
} from '../src/portals.js';
import { listPersonas, listPortals } from '../src/workflow-data.js';
import { testService } from './helpers.js';

const repo = join(import.meta.dirname, '..', '..', '..');
let root: string;
const paths = () => ({ repoRoot: root });
const fence = (id: string) => [join(root, 'personas', '_mixins'), join(root, 'personas', id)];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pathfinder-portals-'));
  cpSync(join(repo, 'personas', '_mixins'), join(root, 'personas', '_mixins'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const WIKI = { environments: { production: { base_url: 'https://www.wikipedia.org/' } } };

describe('createPortal', () => {
  it('writes a portal and a guest persona that load like a run loads them', () => {
    const made = createPortal(paths(), WIKI);
    expect(made).toMatchObject({ portal: 'wikipedia-org', persona: 'guest' });
    expect(listPortals(paths())).toEqual(['wikipedia-org']);
    expect(listPersonas(paths(), 'wikipedia-org')).toEqual(['guest']);
    const e = loadEffectiveConfig(made.files[0]!, made.files[1]!, {
      fence: fence('wikipedia-org'),
    });
    // the BA's decisions (2026-10-06): production, robots ignored, forms may be submitted
    expect(e.portal.environment).toBe('production');
    expect(e.portal.robots).toBe('ignore');
    expect(e.effectiveMaxActionClass).toBe('external-side-effect');
    expect(e.portal.scope.allowed_domains).toEqual(['wikipedia.org']);
  });

  it('takes several environments on start, each with its own address and limit', () => {
    const made = createPortal(paths(), {
      id: 'Shop',
      robots: 'respect',
      environments: {
        production: { base_url: 'shop.example.pl', max_action_class: 'read' },
        staging: { base_url: 'https://staging.shop.example.pl/' },
      },
    });
    expect(made.portal).toBe('shop');
    expect(made.environments).toEqual([
      { environment: 'production', base_url: 'https://shop.example.pl/', max_action_class: 'read' },
      {
        environment: 'staging',
        base_url: 'https://staging.shop.example.pl/',
        max_action_class: 'external-side-effect',
      },
    ]);
    const staging = loadEffectiveConfig(
      made.files[0]!,
      made.files[1]!,
      { fence: fence('shop') },
      'staging',
    );
    expect(staging.portal.scope.allowed_domains).toEqual(['staging.shop.example.pl']);
    expect(readFileSync(made.files[0]!, 'utf8')).toContain('robots: respect');
  });

  it('refuses no environment, a name in use, a bad address and a bad short name, leaving no files', () => {
    expect(() => createPortal(paths(), { environments: {} })).toThrow(/at least one environment/);
    createPortal(paths(), WIKI);
    expect(() => createPortal(paths(), WIKI)).toThrow(
      expect.objectContaining({ code: 'PORTAL_EXISTS' }) as unknown,
    );
    expect(() =>
      createPortal(paths(), {
        environments: { sandbox: { base_url: 'ftp://files.example.test' } },
      }),
    ).toThrow(PortalRefusal);
    expect(() =>
      createPortal(paths(), {
        id: 'no spaces',
        environments: { sandbox: { base_url: 'https://a.test' } },
      }),
    ).toThrow(/lowercase letters/);
    expect(listPortals(paths())).toEqual(['wikipedia-org']);
  });

  it('removes what it wrote when the loader refuses it', () => {
    rmSync(join(root, 'personas', '_mixins'), { recursive: true }); // the persona cannot load
    expect(() =>
      createPortal(paths(), { environments: { sandbox: { base_url: 'https://broken.test' } } }),
    ).toThrow(expect.objectContaining({ code: 'INVALID' }) as unknown);
    expect(existsSync(join(root, 'portals', 'broken-test'))).toBe(false);
    expect(existsSync(join(root, 'personas', 'broken-test'))).toBe(false);
  });

  it('proposes a slug from the host', () => {
    expect(proposeId(new URL('https://WWW.Pl.Wikipedia.org/wiki'))).toBe('pl-wikipedia-org');
    expect(proposeId(new URL('http://127.0.0.1:4010/'))).toBe('127-0-0-1');
  });
});

describe('portal settings: add and revoke environments', () => {
  it('adds an environment, changes one, and revokes one but never the last', () => {
    createPortal(paths(), WIKI);
    const added = setEnvironment(paths(), 'wikipedia-org', 'staging', {
      base_url: 'https://test.wikipedia.org/',
      max_action_class: 'mutating',
    });
    expect(added.environments.map((e) => e.environment)).toEqual(['production', 'staging']);
    const changed = setEnvironment(paths(), 'wikipedia-org', 'production', {
      base_url: 'https://www.wikipedia.org/',
      max_action_class: 'read',
    });
    expect(changed.environments[0]).toMatchObject({ max_action_class: 'read' });
    // the header comment of the file survives the edits
    expect(readFileSync(join(root, 'portals', 'wikipedia-org', 'portal.yaml'), 'utf8')).toMatch(
      /^# Added from the dashboard/,
    );
    const revoked = removeEnvironment(paths(), 'wikipedia-org', 'production');
    expect(revoked.environments.map((e) => e.environment)).toEqual(['staging']);
    expect(() => removeEnvironment(paths(), 'wikipedia-org', 'staging')).toThrow(
      expect.objectContaining({ code: 'LAST_ENVIRONMENT' }) as unknown,
    );
    expect(describePortal(paths(), 'wikipedia-org').environments).toHaveLength(1);
  });

  it('moves a legacy single-environment file to the environments form when one is added', () => {
    mkdirSync(join(root, 'portals', 'old'), { recursive: true });
    mkdirSync(join(root, 'personas', 'old'), { recursive: true });
    writeFileSync(
      join(root, 'portals', 'old', 'portal.yaml'),
      `# keep me\nid: old\nbase_url: http://127.0.0.1:4010/\nenvironment: sandbox\nmax_action_class: mutating\nscope:\n  allowed_domains: ["127.0.0.1"]\n  max_depth: 6\n  max_states: 100\n  max_actions_per_state: 40\n  max_run_time_minutes: 30\n  max_steps: 400\n`,
    );
    writeFileSync(
      join(root, 'personas', 'old', 'guest.yaml'),
      'id: guest\nextends: ["../_mixins/anonymous-base.yaml"]\n',
    );
    const out = setEnvironment(paths(), 'old', 'staging', { base_url: 'http://127.0.0.2:4010/' });
    expect(out.environments).toEqual([
      {
        environment: 'staging',
        base_url: 'http://127.0.0.2:4010/',
        max_action_class: 'external-side-effect',
      },
      { environment: 'sandbox', base_url: 'http://127.0.0.1:4010/', max_action_class: 'mutating' },
    ]);
    expect(readFileSync(join(root, 'portals', 'old', 'portal.yaml'), 'utf8')).toContain(
      '# keep me',
    );
  });

  it('puts the file back when the change does not load, and knows unknown portals', () => {
    createPortal(paths(), WIKI);
    const file = join(root, 'portals', 'wikipedia-org', 'portal.yaml');
    const before = readFileSync(file, 'utf8');
    rmSync(join(root, 'personas', '_mixins'), { recursive: true }); // any check now fails
    expect(() =>
      setEnvironment(paths(), 'wikipedia-org', 'staging', { base_url: 'https://t.wikipedia.org' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID' }) as unknown);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(() => describePortal(paths(), 'nope')).toThrow(
      expect.objectContaining({ code: 'PORTAL_NOT_FOUND' }) as unknown,
    );
  });
});

describe('portal routes', () => {
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
        create: (body) => createPortal(paths(), body),
        describe: (id) => describePortal(paths(), id),
        setEnvironment: (id, env, body) => setEnvironment(paths(), id, env, body),
        removeEnvironment: (id, env) => removeEnvironment(paths(), id, env),
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
    fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  it('creates (201/409/400), describes (200/404), sets and revokes environments (200/409/400)', async () => {
    expect((await send('POST', '/portals', WIKI)).status).toBe(201);
    const again = await send('POST', '/portals', WIKI);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { message: string }).message).toContain('already exists');
    expect(
      (
        await send('POST', '/portals', {
          environments: { sandbox: { base_url: 'mailto:x@y.test' } },
        })
      ).status,
    ).toBe(400);
    expect((await send('GET', '/portals/wikipedia-org')).status).toBe(200);
    expect((await send('GET', '/portals/nope')).status).toBe(404);
    const put = await send('PUT', '/portals/wikipedia-org/environments/staging', {
      base_url: 'https://test.wikipedia.org/',
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { environments: unknown[] }).environments).toHaveLength(2);
    expect(
      (await send('PUT', '/portals/wikipedia-org/environments/qa', { base_url: 'x' })).status,
    ).toBe(400);
    expect((await send('DELETE', '/portals/wikipedia-org/environments/staging')).status).toBe(200);
    expect((await send('DELETE', '/portals/wikipedia-org/environments/production')).status).toBe(
      409,
    );
  });
});
