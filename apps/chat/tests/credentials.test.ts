import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createVaultStore, loadKey, type VaultKey } from '@pathfinder/vault';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { createCredentialsHandler } from '../src/credentials.js';
import { findError, logError } from '../src/error-log.js';
import { testService } from './helpers.js';

const SECRET = 'fake-password-not-real';

describe('credentials endpoint', () => {
  let t: ReturnType<typeof testService>;
  let dir: string;
  let server: Server;
  let base: string;
  let conversationId: string;
  let key: () => VaultKey;

  async function start(handlerKey: () => VaultKey, createStore?: typeof createVaultStore) {
    server = createApi({
      service: t.service,
      logError: (input) => logError(input, { logsDir: join(dir, 'logs') }),
      findError: (ref) => findError(ref, { logsDir: join(dir, 'logs') }),
      version: 'test',
      credentials: createCredentialsHandler({
        db: t.opened.db,
        loadKey: handlerKey,
        ...(createStore === undefined ? {} : { createStore }),
      }),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  }

  const post = (body: unknown, id = conversationId) =>
    fetch(`${base}/conversations/${id}/credentials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    t = testService();
    dir = await mkdtemp(join(tmpdir(), 'chat-cred-'));
    const keyPath = join(dir, 'vault.key');
    await writeFile(keyPath, `${randomBytes(32).toString('base64')}\n`, { mode: 0o600 });
    key = () => loadKey({ path: keyPath });
    conversationId = (await t.service.createConversation({ portal: 'liveinsurer' })).conversation.id;
  });
  afterEach(async () => {
    server.close();
    t.service.close();
    await t.opened.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('stores values in the vault and answers only with the ref names', async () => {
    await start(key);
    const res = await post({
      portal: 'liveinsurer',
      values: { TEST_USER: 'user-not-real', TEST_PASSWORD: SECRET },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ stored: true, refs: ['TEST_USER', 'TEST_PASSWORD'] });
    expect(text).not.toContain(SECRET);
    const vault = createVaultStore(t.opened.db, key());
    expect(await vault.get('liveinsurer', 'sandbox', 'TEST_PASSWORD')).toBe(SECRET);
    const messages = t.opened.raw.prepare('SELECT content FROM chat_messages').all();
    expect(JSON.stringify(messages)).not.toContain(SECRET);
    const replayed: unknown[] = [];
    t.service.subscribe(conversationId, 0, (e) => replayed.push(e))();
    expect(JSON.stringify(replayed)).not.toContain(SECRET);
  });

  it('answers 409 with how to set the key when none is configured', async () => {
    await start(() => loadKey({ path: join(dir, 'missing.key') }));
    const res = await post({ portal: 'liveinsurer', values: { TEST_PASSWORD: SECRET } });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { ref: string; message: string };
    expect(body.message).toContain('PATHFINDER_VAULT_KEY_FILE');
    expect(body.ref).toMatch(/^ERR-/);
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('rejects a bad environment, bad ref name and unknown conversation', async () => {
    await start(key);
    expect(
      (await post({ portal: 'liveinsurer', environment: 'moon', values: { A_B: SECRET } })).status,
    ).toBe(400);
    expect((await post({ portal: 'liveinsurer', values: { '1bad': SECRET } })).status).toBe(400);
    expect((await post({ portal: 'liveinsurer', values: {} })).status).toBe(400);
    expect((await post({ portal: 'liveinsurer', values: { A_B: SECRET } }, 'nope')).status).toBe(404);
  });

  it('keeps the value out of the error log on a failing store', async () => {
    await start(key, () => ({
      set: () => Promise.reject(new Error(`disk failed while writing ${SECRET}`)),
      get: () => Promise.reject(new Error('unused')),
      has: () => Promise.resolve(false),
      list: () => Promise.resolve([]),
      delete: () => Promise.resolve(false),
    }));
    const res = await post({ portal: 'liveinsurer', values: { TEST_PASSWORD: SECRET } });
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain(SECRET);
    const logDir = join(dir, 'logs');
    const files = await readdir(logDir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(await readFile(join(logDir, f), 'utf8')).not.toContain(SECRET);
    expect(
      JSON.stringify(t.opened.raw.prepare('SELECT content FROM chat_messages').all()),
    ).not.toContain(SECRET);
  });
});
