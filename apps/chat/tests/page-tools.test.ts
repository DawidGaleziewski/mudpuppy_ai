// Page context and browser actions (spec 022 R6): the context line, the UI action mapping, and the
// pathfinder-chat page tools against a migrated store with one screen in two revisions.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEvidenceStore, type EvidenceStore } from '@pathfinder/core';
import { migrateUp, openDb, type OpenedDb } from '@pathfinder/store';
import { createChatMcpServer } from '../src/mcp-chat.js';
import { contextLine } from '../src/page-context.js';
import { uiActionOf } from '../src/ui-actions.js';

const repo = resolve(import.meta.dirname, '../../..');
const CONV = '0199a000-0000-7000-8000-000000000001';
const T = '2026-10-06T08:00:00.000Z';

describe('contextLine', () => {
  it('names the page for the agent; the whole portal adds nothing', () => {
    expect(
      contextLine({
        kind: 'page',
        page: { type: 'screen', id: 's-1', rev: 2, label: 'Oferta', ids: ['AMD-001'] },
      }),
    ).toMatch(/^\[Page context: screen s-1 r2 "Oferta"\. On the page: AMD-001\. .*page_context/);
    expect(contextLine({ kind: 'portal' })).toBe('');
    expect(contextLine(undefined)).toBe('');
  });
});

describe('uiActionOf', () => {
  it('maps the browser tools and nothing else', () => {
    expect(
      uiActionOf('mcp__pathfinder-chat__highlight_element', {
        state_id: 's-1',
        element_key: 'button "Kup"',
      }),
    ).toEqual({
      type: 'ui_action',
      action: 'highlight',
      stateId: 's-1',
      elementKey: 'button "Kup"',
      label: null,
    });
    expect(uiActionOf('mcp__pathfinder-chat__open_page', { path: '/states/s-1' })).toEqual({
      type: 'ui_action',
      action: 'open',
      path: '/states/s-1',
    });
    expect(
      uiActionOf('mcp__pathfinder-chat__open_page', { path: 'https://evil.example/' }),
    ).toBeNull();
    expect(uiActionOf('mcp__pathfinder-chat__open_page', { path: '/chat/new' })).toBeNull();
    expect(uiActionOf('mcp__pathfinder-chat__workflow_state', {})).toBeNull();
    expect(uiActionOf(null, {})).toBeNull();
  });
});

describe('page tools', () => {
  let root: string;
  let opened: OpenedDb;
  let client: Client;
  let evidence: EvidenceStore;

  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return { isError: r.isError === true, body: r.structuredContent as Record<string, unknown> };
  };

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'pathfinder-page-tools-'));
    evidence = createEvidenceStore(join(root, 'evidence'));
    const layout = await evidence.storeJson({
      version: 1,
      viewport: { width: 1366, height: 768 },
      page: { width: 1366, height: 900 },
      cut: false,
      elements: [{ key: 'button "Kup"', role: 'button', name: 'Kup', box: null }],
    });
    opened = openDb(':memory:');
    migrateUp(opened.raw, join(repo, 'data', 'migrations'));
    const raw = opened.raw;
    raw
      .prepare(
        `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES (?, 'p', '', ?, ?)`,
      )
      .run(CONV, T, T);
    raw
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
         VALUES ('run-1', 'p', 'guest', 'map', 'sandbox', '2026-10-06', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
      )
      .run(T);
    raw
      .prepare(
        `INSERT INTO screens (id, portal_id, route_template, cluster_id, title, first_seen_run, created_at)
         VALUES ('scr-1', 'p', '/oferta', 'c', 'Oferta', 'run-1', ?)`,
      )
      .run(T);
    const state = raw.prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at, layout_ref, screen_id, screen_rev)
       VALUES (?, 'p', ?, 'c', '/oferta', 'Oferta', 'ev', 'observed', 'settled', 'run-1', ?, ?, 'scr-1', ?)`,
    );
    state.run('s-1', 'fp-1', T, layout, 1);
    state.run('s-2', 'fp-2', T, layout, 2);
    raw
      .prepare(
        `INSERT INTO state_observations (run_id, state_id, persona_id, evidence_ref, observed_at) VALUES ('run-1', 's-2', 'guest', 'ev', ?)`,
      )
      .run(T);
    const server = createChatMcpServer({
      raw,
      paths: { repoRoot: root },
      conversationId: CONV,
      evidence,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
  });

  afterEach(async () => {
    await client.close();
    await opened.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('page_context reads the screen, its revisions and elements', async () => {
    const r = await call('page_context', { type: 'screen', id: 's-2' });
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({
      type: 'screen',
      state: { id: 's-2', revision: 2, route_template: '/oferta' },
      elements: [{ key: 'button "Kup"' }],
    });
    expect(
      (r.body.revisions as { rev: number; seen_by: string | null }[]).map((x) => [
        x.rev,
        x.seen_by,
      ]),
    ).toEqual([
      [1, null],
      [2, 'run-1'],
    ]);
    expect((await call('page_context', { type: 'screen', id: 'nope' })).isError).toBe(true);
  });

  it('highlight_element checks the element exists; open_page answers', async () => {
    expect(
      (await call('highlight_element', { state_id: 's-1', element_key: 'button "Kup"' })).isError,
    ).toBe(false);
    expect(
      (await call('highlight_element', { state_id: 's-1', element_key: 'link "X"' })).isError,
    ).toBe(true);
    expect((await call('highlight_element', { state_id: 'nope' })).isError).toBe(true);
    expect((await call('open_page', { path: '/states/s-1' })).body).toEqual({
      opened: '/states/s-1',
    });
  });
});
