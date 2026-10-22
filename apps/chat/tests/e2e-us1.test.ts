import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { workflowState } from '@mudpuppy/workflow';
import { loadKey } from '@mudpuppy/vault';
import { createApi, listenLocal } from '../src/api.js';
import { createCredentialsHandler } from '../src/credentials.js';
import { createChatMcpServer } from '../src/mcp-chat.js';
import { openingMessage } from '../src/opening.js';
import { ChatService } from '../src/service.js';
import { listPortals, loadWorkflowInput } from '../src/workflow-data.js';
import { fakeAgent } from './fake-agent.js';
import { memoryStore } from './helpers.js';

/**
 * R-30 T021 (US1, SC-001): the deterministic half of "ask what I can do and scan a portal",
 * end to end over the HTTP API and the mudpuppy-chat tools the orchestrator calls. The model's
 * wording is not under test; the path is: an empty workspace opens with an offer to scan, each
 * missing input is named, nothing starts until all are present, and then the scan is requested.
 */
const repo = resolve(import.meta.dirname, '../../..');
const P = 'proving-ground-bank';
const fakePassword = 'fake-password-not-real';
let root: string;
let mem: ReturnType<typeof memoryStore>;
let server: Server;
let base: string;
let mcp: Client;
let conversationId: string;

async function tool(name: string, args: Record<string, unknown>) {
  const r = await mcp.callTool({ name, arguments: args });
  return {
    isError: r.isError === true,
    body: r.structuredContent as Record<string, unknown> & {
      error?: { code: string; details?: string[] };
    },
  };
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mudpuppy-e2e-us1-'));
  for (const dir of ['portals/proving-ground-bank', 'personas/_mixins'])
    cpSync(join(repo, dir), join(root, dir), { recursive: true });
  const keyPath = join(root, 'vault.key');
  writeFileSync(keyPath, `${randomBytes(32).toString('base64')}\n`, { mode: 0o600 });
  mem = memoryStore();
  const agent = fakeAgent();
  const service = new ChatService({
    store: mem.store,
    launch: agent.launch,
    sessionRequest: () => ({ cwd: root, mcpServers: [] }),
    policy: () => ({ allow: true, reason: '' }),
    logError: () => Promise.resolve({ ref: 'ERR-E2E', logged: true }),
    opening: (portal, id) =>
      openingMessage(
        workflowState(loadWorkflowInput(mem.opened.raw, { repoRoot: root }, portal, id)),
        listPortals({ repoRoot: root }),
      ),
  });
  server = createApi({
    service,
    logError: () => Promise.resolve({ ref: 'ERR-E2E', logged: true }),
    findError: () => Promise.resolve(null),
    version: 'test',
    credentials: createCredentialsHandler({
      db: mem.opened.db,
      loadKey: () => loadKey({ path: keyPath }),
    }),
  });
  base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
});
afterAll(async () => {
  await mcp.close();
  server.close();
  await mem.opened.close();
  rmSync(root, { recursive: true, force: true });
});

describe('US1 end to end with a stub agent', () => {
  it('1. the chat opens on the portal and says what a scan needs', async () => {
    const res = await fetch(`${base}/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ portal: P }),
    });
    expect(res.status).toBe(201);
    conversationId = ((await res.json()) as { id: string }).id;
    const server = createChatMcpServer({
      raw: mem.opened.raw,
      paths: { repoRoot: root },
      conversationId,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    mcp = new Client({ name: 'stub-orchestrator', version: '0' });
    await Promise.all([server.connect(a), mcp.connect(b)]);
    const opening = (await mem.store.listMessages(conversationId))[0];
    expect(opening?.role).toBe('assistant');
    expect(opening?.content).toContain('A scan needs: persona, test-user credentials.');
  });

  it('2. a scan is refused while the persona is missing', async () => {
    const r = await tool('request_scan', { portal: P, persona: 'client' });
    expect(r.body.error).toMatchObject({ code: 'MISSING_INPUT', details: ['persona'] });
  });

  it('3. the persona is built in conversation; an inline password is refused', async () => {
    const leaked = await tool('save_persona', {
      portal: P,
      persona: {
        id: 'client',
        extends: ['../_mixins/anonymous-base.yaml'],
        auth: { login: 'ref:PG_BANK_LOGIN', password: fakePassword },
      },
    });
    expect(leaked.body.error?.code).toBe('INLINE_SECRET');
    const saved = await tool('save_persona', {
      portal: P,
      persona: {
        id: 'client',
        extends: ['../_mixins/anonymous-base.yaml'],
        auth: { login: 'ref:PG_BANK_LOGIN', password: 'ref:PG_BANK_PASSWORD' },
      },
    });
    expect(saved.isError, JSON.stringify(saved.body)).toBe(false);
    expect(saved.body.credentialRefs).toEqual(['PG_BANK_LOGIN', 'PG_BANK_PASSWORD']);
  });

  it('4. the scan is still refused, naming exactly the missing credentials', async () => {
    const r = await tool('request_scan', { portal: P, persona: 'client' });
    expect(r.body.error).toMatchObject({
      code: 'MISSING_INPUT',
      details: [
        'test-user credential PG_BANK_LOGIN for sandbox',
        'test-user credential PG_BANK_PASSWORD for sandbox',
      ],
    });
    const steps = mem.opened.raw.prepare(`SELECT count(*) AS n FROM workflow_steps`).get() as {
      n: number;
    };
    expect(steps.n).toBe(0);
  });

  it('5. credentials go through the form endpoint, never the chat', async () => {
    const res = await fetch(`${base}/conversations/${conversationId}/credentials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        portal: P,
        values: { PG_BANK_LOGIN: 'tester', PG_BANK_PASSWORD: fakePassword },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(fakePassword);
    const messages = await mem.store.listMessages(conversationId);
    expect(JSON.stringify(messages)).not.toContain(fakePassword);
  });

  it('6. with everything present the scan is requested and the step is pending', async () => {
    const r = await tool('request_scan', { portal: P, persona: 'client' });
    expect(r.isError, JSON.stringify(r.body)).toBe(false);
    expect(r.body).toMatchObject({
      step: 'scan',
      status: 'pending',
      handoff: { agent: 'crawler' },
    });
    const state = await tool('workflow_state', { portal: P });
    expect((state.body.steps as { step: string; status: string }[])[0]).toEqual(
      expect.objectContaining({ step: 'scan', status: 'pending' }),
    );
    expect(state.body.busy).toBe(true);
  });
});
