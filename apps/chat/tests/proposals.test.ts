// Proposals (spec 022 R6, FE-A04): the assistant's propose_change only stores an open proposal;
// a person applies it through the amendment write path (one revision, base check), undoes it
// (one more revision) or discards it. A moved head makes it stale; nothing is overwritten.
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createEvidenceStore } from '@pathfinder/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAmendmentService, type AmendmentService } from '../src/amendments.js';
import { createApi, listenLocal } from '../src/api.js';
import { logError } from '../src/error-log.js';
import { createChatMcpServer } from '../src/mcp-chat.js';
import { createProposalService } from '../src/proposal-service.js';
import { testService } from './helpers.js';

const P = 'reference-insurer';
const CONV = '0199a000-0000-7000-8000-0000000000aa';
const T = '2026-10-06T08:00:00.000Z';

type Json = Record<string, unknown>;

describe('proposals', () => {
  let t: ReturnType<typeof testService>;
  let dir: string;
  let server: Server;
  let base: string;
  let client: Client;
  let amendments: AmendmentService;

  beforeEach(async () => {
    t = testService();
    dir = await mkdtemp(join(tmpdir(), 'chat-proposals-'));
    const evidence = createEvidenceStore(dir);
    const raw = t.opened.raw;
    raw
      .prepare(
        `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES (?, ?, '', ?, ?)`,
      )
      .run(CONV, P, T, T);
    raw
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
         VALUES ('run-1', ?, 'guest', 'map', 'sandbox', '2026-10-06', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
      )
      .run(P, T);
    raw
      .prepare(
        `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
         VALUES ('s-offer', ?, 'fp-offer', 'c', '/oferta', 'Oferta', 'ev', 'observed', 'settled', 'run-1', ?)`,
      )
      .run(P, T);
    amendments = createAmendmentService({ db: t.opened.db, evidence });
    server = createApi({
      service: t.service,
      logError: (input) => logError(input, { logsDir: join(dir, 'logs') }),
      findError: () => Promise.resolve(null),
      version: 'test',
      amendments,
      proposals: createProposalService({ db: t.opened.db, amendments }),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
    const mcp = createChatMcpServer({ raw, paths: { repoRoot: dir }, conversationId: CONV });
    const [a, b] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([mcp.connect(a), client.connect(b)]);
  });

  afterEach(async () => {
    await client.close();
    server.close();
    t.service.close();
    await t.opened.close();
    await rm(dir, { recursive: true, force: true });
  });

  const propose = async (args: Json) => {
    const r = await client.callTool({ name: 'propose_change', arguments: { portal: P, ...args } });
    return { isError: r.isError === true, body: r.structuredContent as Json };
  };
  const decide = async (id: string, verb: 'apply' | 'discard' | 'undo', author = 'Anna') => {
    const res = await fetch(`${base}/portals/${P}/proposals/${id}/${verb}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ author }),
    });
    return { status: res.status, body: (await res.json()) as Json };
  };
  const proposalId = (body: Json) => (body.proposal as { id: string }).id;
  const row = (id: string) =>
    t.opened.raw.prepare('SELECT * FROM chat_proposals WHERE id = ?').get(id) as Json;
  const amendmentCount = () =>
    (t.opened.raw.prepare('SELECT count(*) AS n FROM amendments').get() as { n: number }).n;

  it('propose_change stores an open proposal and writes no amendment', async () => {
    const r = await propose({
      summary: 'Add a note on the offer',
      target_kind: 'state',
      target_id: 's-offer',
      text: 'Show the price with tax',
    });
    expect(r.isError).toBe(false);
    const stored = row(proposalId(r.body));
    expect(stored).toMatchObject({
      conversation_id: CONV,
      target_kind: 'new_amendment',
      target_id: null,
      base_rev: null,
      status: 'open',
    });
    expect(JSON.parse(stored.payload as string)).toEqual({
      kind: 'note',
      target_kind: 'state',
      target_id: 's-offer',
      text: 'Show the price with tax',
    });
    expect(amendmentCount()).toBe(0);
  });

  it('refuses a proposal on an unknown screen or without the new text', async () => {
    const unknown = await propose({
      summary: 'x',
      target_kind: 'state',
      target_id: 's-none',
      text: 'y',
    });
    expect(unknown).toMatchObject({ isError: true, body: { error: { code: 'NOT_FOUND' } } });
    const created = await amendments.create(P, {
      kind: 'note',
      target_kind: 'state',
      target_id: 's-offer',
      text: 'first',
      author: 'BA',
    });
    const noText = await propose({ summary: 'x', amendment_id: created.id });
    expect(noText).toMatchObject({ isError: true, body: { error: { code: 'INVALID' } } });
  });

  it('applies a new note as AMD-001 signed by the person, and Undo withdraws it', async () => {
    const id = proposalId(
      (
        await propose({
          summary: 'Add a note',
          target_kind: 'state',
          target_id: 's-offer',
          text: 'Show the price with tax',
        })
      ).body,
    );
    const applied = await decide(id, 'apply');
    expect(applied.status).toBe(200);
    expect(applied.body).toMatchObject({
      proposal: { status: 'applied', applied_rev: 1, decided_by: 'Anna' },
      amendment: { key: 'AMD-001', author: 'Anna', status: 'active', rev: 1 },
    });
    expect((await decide(id, 'apply')).status).toBe(409);

    const undone = await decide(id, 'undo');
    expect(undone.status).toBe(200);
    expect(undone.body).toMatchObject({
      proposal: { status: 'discarded', applied_rev: 1 },
      amendment: { status: 'withdrawn', rev: 2 },
    });
  });

  it('applies new text as one revision and Undo restores the text before it', async () => {
    const head = await amendments.create(P, {
      kind: 'note',
      target_kind: 'state',
      target_id: 's-offer',
      text: 'first wording',
      author: 'BA',
    });
    const id = proposalId(
      (await propose({ summary: 'Clearer wording', amendment_id: head.id, text: 'clearer' })).body,
    );
    expect(row(id)).toMatchObject({ target_kind: 'amendment', target_id: head.id, base_rev: 1 });
    const applied = await decide(id, 'apply');
    expect(applied.body).toMatchObject({ amendment: { rev: 2, text: 'clearer' } });
    const undone = await decide(id, 'undo');
    expect(undone.body).toMatchObject({ amendment: { rev: 3, text: 'first wording' } });
    const changes = (await amendments.revisions(P, head.id)).map((r) => [
      r.rev,
      r.change,
      r.author,
    ]);
    expect(changes).toEqual([
      [1, 'create', 'BA'],
      [2, 'edit', 'Anna'],
      [3, 'restore', 'Anna'],
    ]);
  });

  it('turns stale when the amendment moved on, overwrites nothing, and can still be discarded', async () => {
    const head = await amendments.create(P, {
      kind: 'note',
      target_kind: 'state',
      target_id: 's-offer',
      text: 'first',
      author: 'BA',
    });
    const id = proposalId(
      (await propose({ summary: 'Reword', amendment_id: head.id, text: 'from the assistant' }))
        .body,
    );
    await amendments.edit(P, head.id, {
      text: 'the BA got there first',
      author: 'BA',
      base_rev: 1,
    });

    const stale = await decide(id, 'apply');
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'STALE_PROPOSAL' });
    expect(row(id)).toMatchObject({ status: 'stale' });
    expect((await amendments.revisions(P, head.id)).at(-1)).toMatchObject({
      rev: 2,
      text: 'the BA got there first',
    });
    expect((await decide(id, 'apply')).body).toMatchObject({ code: 'STALE_PROPOSAL' });
    expect((await decide(id, 'discard')).body).toMatchObject({ proposal: { status: 'discarded' } });
  });

  it('discards an open proposal and answers 404 for another portal', async () => {
    const id = proposalId(
      (await propose({ summary: 'x', target_kind: 'state', target_id: 's-offer', text: 'y' })).body,
    );
    const res = await fetch(`${base}/portals/other/proposals/${id}/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
    expect((await decide(id, 'discard')).body).toMatchObject({
      proposal: { status: 'discarded', decided_by: 'Anna' },
    });
    expect((await decide(id, 'undo')).status).toBe(409);
    expect(amendmentCount()).toBe(0);
  });
});
