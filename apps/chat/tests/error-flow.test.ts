import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SECRETS } from '@pathfinder/core';
import { findError, logError } from '../src/error-log.js';
import type { ChatEvent } from '../src/events.js';
import { ChatService } from '../src/service.js';
import { fakeAgent } from './fake-agent.js';
import { memoryStore, until } from './helpers.js';

/**
 * R-30 T025 (US5, FR-011, FR-012, SC-003): a forced failure shows a reference in the chat, and the
 * log folder has exactly one line under that reference, with the technical detail and no secret.
 */
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pathfinder-errflow-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('error flow', () => {
  it('an agent crash gives each error event exactly one redacted log line', async () => {
    SECRETS.add('fake-password-not-real');
    const mem = memoryStore();
    const agent = fakeAgent();
    const service = new ChatService({
      store: mem.store,
      launch: agent.launch,
      sessionRequest: () => ({ cwd: dir, mcpServers: [] }),
      policy: () => ({ allow: true, reason: '' }),
      logError: (input) =>
        logError(
          { ...input, detail: { input: input.detail, note: 'login fake-password-not-real' } },
          { logsDir: join(dir, 'logs') },
        ),
    });
    const { conversation } = await service.createConversation({ portal: 'reference-insurer' });
    const events: ChatEvent[] = [];
    service.subscribe(conversation.id, null, (e) => events.push(e.event));
    await service.send(conversation.id, 'crash');
    await until(() => events.some((e) => e.type === 'idle'));
    await service.drain(conversation.id);

    const errors = events.filter(
      (e): e is Extract<ChatEvent, { type: 'error' }> => e.type === 'error',
    );
    expect(errors.length).toBeGreaterThan(0);
    const files = readdirSync(join(dir, 'logs'));
    const lines = files.flatMap((f) =>
      readFileSync(join(dir, 'logs', f), 'utf8')
        .split('\n')
        .filter((l) => l !== ''),
    );
    for (const e of errors) {
      expect(e.ref).toMatch(/^ERR-[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(lines.filter((l) => l.includes(e.ref))).toHaveLength(1);
      const record = await findError(e.ref, { logsDir: join(dir, 'logs') });
      expect(record).toMatchObject({ ref: e.ref, conversation_id: conversation.id });
      expect(record?.where).toMatch(/^acp-client/);
    }
    expect(lines.join('\n')).not.toContain('fake-password-not-real');
    const stored = await mem.store.listMessages(conversation.id);
    expect(stored.filter((m) => m.error_ref !== null).map((m) => m.error_ref)).toEqual(
      errors.map((e) => e.ref),
    );
    service.close();
    await mem.opened.close();
  });
});
