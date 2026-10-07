import { migrateUp, openDb, type OpenedDb } from '@pathfinder/core';
import { join } from 'node:path';
import { ChatStore } from '../src/store.js';

export const MIGRATIONS = join(import.meta.dirname, '..', '..', '..', 'data', 'migrations');

/** An in-memory store with every migration applied. */
export function memoryStore(): { opened: OpenedDb; store: ChatStore } {
  const opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  return { opened, store: new ChatStore(opened.db) };
}

export async function until(check: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

import type { PermissionPolicy } from '../src/acp-client.js';
import type { ErrorInput } from '../src/error-log.js';
import { ChatService } from '../src/service.js';
import { fakeAgent } from './fake-agent.js';

/** A ChatService on an in-memory store and the fake agent; errors are collected, not written. */
export function testService(
  policy: PermissionPolicy = () => ({ allow: true, reason: 'ok' }),
): ReturnType<typeof memoryStore> &
  ReturnType<typeof fakeAgent> & { service: ChatService; errors: ErrorInput[] } {
  const mem = memoryStore();
  const agent = fakeAgent();
  const errors: ErrorInput[] = [];
  const service = new ChatService({
    store: mem.store,
    launch: agent.launch,
    sessionRequest: () => ({ cwd: '/tmp/pathfinder-chat-runtime', mcpServers: [] }),
    policy,
    logError: (input) => {
      errors.push(input);
      return Promise.resolve({ ref: `ERR-TEST${String(errors.length)}`, logged: true });
    },
  });
  return { ...mem, ...agent, service, errors };
}
