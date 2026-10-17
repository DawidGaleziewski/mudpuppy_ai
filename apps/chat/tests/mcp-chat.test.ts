import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateUp, openDb, type OpenedDb } from '@pathfinder/store';
import { createChatMcpServer } from '../src/mcp-chat.js';
import { createPortal } from '../src/portals.js';

const repo = resolve(import.meta.dirname, '../../..');
const CONV = '0199a000-0000-7000-8000-000000000001';

let root: string;
let opened: OpenedDb;
let client: Client;

function seedConversation(): void {
  opened.raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at)
       VALUES (?, NULL, 'test', '2026-10-05T20:00:00.000Z', '2026-10-05T20:00:00.000Z')`,
    )
    .run(CONV);
}

let runSeq = 0;
function seedRun(status: string, persona = 'guest', mode = 'map'): string {
  runSeq += 1;
  const id = `0199a000-0000-7000-8000-${String(runSeq).padStart(12, '0')}`;
  opened.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
         locale, browser, config_snapshot, status, started_at)
       VALUES (?, 'reference-insurer', ?, ?, 'sandbox', '2026-10-06', '1280x800', 'pl-PL',
         'chromium', '{}', ?, ?)`,
    )
    .run(id, persona, mode, status, `2026-10-06T08:00:0${String(runSeq)}.000Z`);
  return id;
}

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  return {
    isError: result.isError === true,
    body: result.structuredContent as Record<string, unknown> & {
      error?: { code: string; message: string; details?: string[] };
    },
  };
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'pathfinder-chat-mcp-'));
  for (const dir of [
    'portals/reference-insurer',
    'portals/reference-insurer-readonly',
    'personas/_mixins',
    'personas/reference-insurer',
  ])
    cpSync(join(repo, dir), join(root, dir), { recursive: true });
  opened = openDb(':memory:');
  migrateUp(opened.raw, join(repo, 'data', 'migrations'));
  seedConversation();
  const server = createChatMcpServer({
    raw: opened.raw,
    paths: { repoRoot: root },
    conversationId: CONV,
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

describe('pathfinder-chat MCP server', () => {
  it('lists exactly the contract tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'highlight_element',
      'list_amendments',
      'list_grouping_inputs',
      'list_process_candidates',
      'open_page',
      'page_context',
      'propose_change',
      'request_credential',
      'request_documentation',
      'request_scan',
      'save_persona',
      'save_test_data',
      'set_process_scope',
      'stop_scan',
      'workflow_state',
    ]);
  });

  it('workflow_state without a portal lists portals and proposes nothing', async () => {
    const { body } = await call('workflow_state', {});
    expect(body.portals).toEqual(['reference-insurer', 'reference-insurer-readonly']);
    expect(body.proposals).toEqual([]);
  });

  it('workflow_state: an anonymous persona can scan without any stored credentials', async () => {
    const { body } = await call('workflow_state', { portal: 'reference-insurer' });
    const scan = (body.moves as { move: string; valid: boolean }[]).find((m) => m.move === 'scan');
    expect(scan?.valid).toBe(true);
    expect(body.proposals).toEqual(['scan']);
  });

  it('workflow_state: a portal whose only persona logs in waits for its credentials', async () => {
    cpSync(join(repo, 'portals/proving-ground-bank'), join(root, 'portals/proving-ground-bank'), {
      recursive: true,
    });
    cpSync(
      join(repo, 'personas/proving-ground-bank/client.yaml'),
      join(root, 'personas/proving-ground-bank/client.yaml'),
    );
    const { body } = await call('workflow_state', { portal: 'proving-ground-bank' });
    const scan = (body.moves as { move: string; missing: string[] }[]).find(
      (m) => m.move === 'scan',
    );
    expect(scan?.missing).toEqual(['test-user credentials']);
  });

  it('save_persona writes a valid persona and reports its effective ceiling', async () => {
    const { isError, body } = await call('save_persona', {
      portal: 'reference-insurer',
      persona: { id: 'quote-seeker', extends: ['../_mixins/anonymous-base.yaml'] },
    });
    expect(isError).toBe(false);
    expect(body).toMatchObject({ persona: 'quote-seeker', effectiveMaxActionClass: 'read' });
    expect(existsSync(join(root, 'personas/reference-insurer/quote-seeker.yaml'))).toBe(true);
  });

  it('save_persona refuses an inline password', async () => {
    const { isError, body } = await call('save_persona', {
      portal: 'reference-insurer',
      persona: {
        id: 'client',
        extends: ['../_mixins/anonymous-base.yaml'],
        auth: { login: 'ref:RI_LOGIN', password: 'fake-password-not-real' },
      },
    });
    expect(isError).toBe(true);
    expect(body.error?.code).toBe('INLINE_SECRET');
    expect(JSON.stringify(body)).not.toContain('fake-password-not-real');
    expect(existsSync(join(root, 'personas/reference-insurer/client.yaml'))).toBe(false);
  });

  it('save_persona refuses to widen the portal ceiling', async () => {
    const { body } = await call('save_persona', {
      portal: 'reference-insurer-readonly',
      persona: {
        id: 'bold',
        extends: ['../_mixins/anonymous-base.yaml'],
        max_action_class: 'external-side-effect',
      },
    });
    expect(body.error?.code).toBe('CEILING_WIDENED');
  });

  it('save_persona never overwrites', async () => {
    const before = readFileSync(join(root, 'personas/reference-insurer/guest.yaml'), 'utf8');
    const { body } = await call('save_persona', {
      portal: 'reference-insurer',
      persona: { id: 'guest', extends: ['../_mixins/anonymous-base.yaml'] },
    });
    expect(body.error?.code).toBe('PERSONA_EXISTS');
    expect(readFileSync(join(root, 'personas/reference-insurer/guest.yaml'), 'utf8')).toBe(before);
  });

  it('save_persona rejects an extends outside the portal fence and leaves no file', async () => {
    const { body } = await call('save_persona', {
      portal: 'reference-insurer',
      persona: { id: 'sneaky', extends: ['../../portals/reference-insurer/portal.yaml'] },
    });
    expect(body.error?.code).toBe('INVALID');
    expect(existsSync(join(root, 'personas/reference-insurer/sneaky.yaml'))).toBe(false);
  });

  it('request_scan asks only for what is missing', async () => {
    const { body } = await call('request_scan', { portal: 'nope', persona: 'guest' });
    expect(body.error).toMatchObject({
      code: 'MISSING_INPUT',
      details: ['the portal: the BA adds it with "+ new portal" in the portal dropdown', 'persona'],
    });
  });

  it('request_scan records a pending step and hands off to the crawler', async () => {
    const { isError, body } = await call('request_scan', {
      portal: 'reference-insurer',
      persona: 'guest',
    });
    expect(isError).toBe(false);
    expect(body).toMatchObject({ step: 'scan', status: 'pending', handoff: { agent: 'crawler' } });
    const row = opened.raw
      .prepare(`SELECT step, status, portal_id FROM workflow_steps WHERE conversation_id = ?`)
      .get(CONV);
    expect(row).toEqual({ step: 'scan', status: 'pending', portal_id: 'reference-insurer' });
    const state = await call('workflow_state', { portal: 'reference-insurer' });
    expect((state.body.steps as { step: string; status: string }[])[0]).toMatchObject({
      step: 'scan',
      status: 'pending',
    });
  });

  it('request_scan asks which environment when the portal has several, then passes it on (spec 011)', async () => {
    createPortal(
      { repoRoot: root },
      {
        environments: {
          production: { base_url: 'https://shop.example.pl/' },
          staging: { base_url: 'https://staging.shop.example.pl/' },
        },
      },
    );
    const ask = await call('request_scan', { portal: 'shop-example-pl', persona: 'guest' });
    expect(ask.body).toMatchObject({
      error: { code: 'MISSING_INPUT', details: ['environment: one of production, staging'] },
    });
    const go = await call('request_scan', {
      portal: 'shop-example-pl',
      persona: 'guest',
      environment: 'production',
    });
    expect(go.isError).toBe(false);
    const prompt = (go.body as { handoff: { prompt: string } }).handoff.prompt;
    expect(prompt).toContain('call start_run with environment "production"');
  });

  it('request_scan names missing vault credentials, then accepts once they are stored', async () => {
    for (const dir of ['portals/proving-ground-bank', 'personas/proving-ground-bank'])
      cpSync(join(repo, dir), join(root, dir), { recursive: true });
    const missing = await call('request_scan', {
      portal: 'proving-ground-bank',
      persona: 'client',
    });
    expect(missing.body.error?.code).toBe('MISSING_INPUT');
    expect(missing.body.error?.details).toEqual([
      'test-user credential PG_BANK_LOGIN for sandbox',
      'test-user credential PG_BANK_PASSWORD for sandbox',
    ]);
    const insert = opened.raw.prepare(
      `INSERT INTO credentials (id, portal_id, environment, ref_name, ciphertext, nonce, key_id, created_at, updated_at)
       VALUES (?, 'proving-ground-bank', 'sandbox', ?, x'00', zeroblob(12), 'abcd1234', '2026-10-05T20:00:00.000Z', '2026-10-05T20:00:00.000Z')`,
    );
    insert.run('0199a000-0000-7000-8000-0000000000a1', 'PG_BANK_LOGIN');
    insert.run('0199a000-0000-7000-8000-0000000000a2', 'PG_BANK_PASSWORD');
    const ok = await call('request_scan', { portal: 'proving-ground-bank', persona: 'client' });
    expect(ok.isError).toBe(false);
  });

  it('request_scan passes config problems through as INVALID', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      join(root, 'personas/reference-insurer/client.yaml'),
      'id: client\nextends: ["../_mixins/anonymous-base.yaml"]\nauth:\n  login: ref:RI_LOGIN\n  password: ref:RI_PASSWORD\n',
    );
    const { body } = await call('request_scan', { portal: 'reference-insurer', persona: 'client' });
    expect(body.error?.code).toBe('INVALID');
    expect(body.error?.details?.[0]).toContain('portal has no login block');
  });

  it('request_scan briefs the crawler to drain the frontier (F-13)', async () => {
    const { body } = await call('request_scan', { portal: 'reference-insurer', persona: 'guest' });
    const prompt = (body.handoff as { prompt: string }).prompt;
    expect(prompt).toContain('Drain the frontier by acting on each result');
    expect(prompt).toContain('get_next_frontier_item when a result has none');
    expect(prompt).not.toContain('resume_run_id');
  });

  it('a probe scan needs Probe marks and briefs the crawler to probe only them (spec 032 US5)', async () => {
    const probe = { portal: 'reference-insurer', persona: 'guest', probe_marked: true };
    const none = await call('request_scan', probe);
    expect(none.body.error).toMatchObject({ code: 'MISSING_INPUT' });
    expect(JSON.stringify(none.body.error)).toContain('Mark for probing');
    const readOnly = await call('request_scan', { ...probe, allow_writes: false });
    expect(readOnly.body.error).toMatchObject({ code: 'INVALID' });

    opened.raw
      .prepare(
        `INSERT INTO marks (id, portal_id, kind, target_kind, target_id, created_by, created_at)
         VALUES ('m-1', 'reference-insurer', 'probe', 'form_step', 'fs-1', 'BA', '2026-10-17T00:00:00Z')`,
      )
      .run();
    const { isError, body } = await call('request_scan', probe);
    expect(isError).toBe(false);
    const prompt = (body.handoff as { prompt: string }).prompt;
    expect(prompt).toContain('probe_marked true');
    expect(prompt).toContain('Do not follow the frontier');
    expect(prompt).not.toContain('Drain the frontier');
  });

  it('stop_scan stops the running scan; request_scan resumes it (T041)', async () => {
    expect((await call('stop_scan', { portal: 'reference-insurer' })).body.error?.code).toBe(
      'NO_RUNNING_SCAN',
    );
    const runId = seedRun('running');
    const stopped = await call('stop_scan', { portal: 'reference-insurer' });
    expect(stopped.body).toEqual({
      run_id: runId,
      portal_id: 'reference-insurer',
      mode: 'map',
      status: 'interrupted',
    });
    const resumed = await call('request_scan', {
      portal: 'reference-insurer',
      persona: 'guest',
      resume_run_id: runId,
    });
    expect(resumed.isError).toBe(false);
    expect((resumed.body.handoff as { prompt: string }).prompt).toContain(
      `resume_run_id "${runId}"`,
    );
    const row = opened.raw
      .prepare(`SELECT status, run_id FROM workflow_steps WHERE conversation_id = ?`)
      .get(CONV);
    expect(row).toEqual({ status: 'pending', run_id: runId });
  });

  it('request_scan refuses to resume a run that is not a stopped scan of that portal and persona', async () => {
    const running = seedRun('running');
    const resume = (id: string) =>
      call('request_scan', { portal: 'reference-insurer', persona: 'guest', resume_run_id: id });
    expect((await resume(running)).body.error?.code).toBe('SCAN_RUNNING');
    opened.raw.prepare(`UPDATE runs SET status = 'completed' WHERE id = ?`).run(running);
    expect((await resume('ghost')).body.error?.message).toContain('does not exist');
    const done = seedRun('completed');
    const wrongPersona = seedRun('interrupted', 'client');
    const w = await call('request_scan', {
      portal: 'reference-insurer',
      persona: 'guest',
      resume_run_id: wrongPersona,
    });
    expect(w.body.error).toMatchObject({ code: 'RUN_NOT_RESUMABLE' });
    const c = await call('request_scan', {
      portal: 'reference-insurer',
      persona: 'guest',
      resume_run_id: done,
    });
    expect(c.body.error?.message).toContain('is completed; only a stopped');
  });

  it('request_scan may act with images by default; the BA’s choices reach the crawler brief (FR-013, FR-014)', async () => {
    const prompt = async (args: Record<string, unknown>) => {
      const r = await call('request_scan', {
        portal: 'reference-insurer',
        persona: 'guest',
        ...args,
      });
      return (r.body.handoff as { prompt: string }).prompt;
    };
    // Owner 2026-10-14: a chat scan may fill and submit forms unless the BA says "only look".
    const plain = await prompt({});
    expect(plain).toContain('max_action_class "external-side-effect"');
    expect(plain).toContain('skip_images false');
    const look = await prompt({ allow_writes: false, skip_images: true });
    expect(look).toContain('max_action_class "read"');
    // The server enforces read-only; the brief must not forbid allowed searches (F-10).
    expect(look).toContain('act on every action it marks allowed, searching included');
    expect(look).not.toContain('no form is filled');
    expect(look).toContain('skip_images true');
    const stopped = seedRun('interrupted');
    const resumed = await prompt({ resume_run_id: stopped });
    expect(resumed).not.toContain('max_action_class');
    expect(resumed).not.toContain('skip_images');
  });

  it('request_scan resumes with the run’s own persona when none is given; a new scan needs one (F-02)', async () => {
    const fresh = await call('request_scan', { portal: 'reference-insurer' });
    expect(fresh.body.error).toMatchObject({ code: 'MISSING_INPUT', details: ['persona'] });
    const stopped = seedRun('interrupted');
    const resumed = await call('request_scan', {
      portal: 'reference-insurer',
      resume_run_id: stopped,
    });
    expect(resumed.isError).toBe(false);
    expect((resumed.body.handoff as { prompt: string }).prompt).toContain('as persona "guest"');
  });

  it('request_scan passes the BA’s focus to the crawler; a resume passes it only when changed (spec 011 FR-017)', async () => {
    const focus = {
      start_url: 'https://en.wikipedia.org/',
      only_domains: ['en.wikipedia.org'],
      exclude_paths: ['/wiki/Special:*'],
    };
    const r = await call('request_scan', { portal: 'reference-insurer', persona: 'guest', focus });
    expect((r.body.handoff as { prompt: string }).prompt).toContain(
      `focus ${JSON.stringify(focus)}`,
    );
    const stopped = seedRun('interrupted');
    const resumed = await call('request_scan', {
      portal: 'reference-insurer',
      resume_run_id: stopped,
    });
    expect((resumed.body.handoff as { prompt: string }).prompt).not.toContain('focus');
    const bad = await call('request_scan', {
      portal: 'reference-insurer',
      persona: 'guest',
      focus: { exclude_paths: ['wiki/*'] },
    });
    expect(bad.isError).toBe(true);
  });

  it('request_scan with a process hands off one trace: the "map a process" step (spec 011 FR-019)', async () => {
    const process = { name: 'Search for a pickle', goal: 'results for "pickle" are shown' };
    const r = await call('request_scan', {
      portal: 'reference-insurer',
      persona: 'guest',
      process,
    });
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({ step: 'map', status: 'pending', handoff: { agent: 'crawler' } });
    const prompt = (r.body.handoff as { prompt: string }).prompt;
    expect(prompt).toContain('mode "trace"');
    expect(prompt).toContain(JSON.stringify(process));
    expect(prompt).toContain('max_action_class "external-side-effect"');
    expect(prompt).not.toContain('Drain the frontier');
    expect(
      opened.raw
        .prepare(`SELECT step, status FROM workflow_steps WHERE conversation_id = ?`)
        .get(CONV),
    ).toEqual({ step: 'map', status: 'pending' });
    const stopped = seedRun('interrupted');
    const both = await call('request_scan', {
      portal: 'reference-insurer',
      resume_run_id: stopped,
      process,
    });
    expect(both.body.error?.code).toBe('INVALID');
  });

  it('request_scan refuses while a process trace of the portal runs: one crawler at a time', async () => {
    seedRun('running', 'guest', 'trace');
    const r = await call('request_scan', { portal: 'reference-insurer', persona: 'guest' });
    expect(r.body.error).toMatchObject({ code: 'SCAN_RUNNING' });
    expect(r.body.error?.message).toContain(
      'a process trace of reference-insurer is already running',
    );
  });

  it('list_amendments is read only and filters by status', async () => {
    const { body } = await call('list_amendments', {
      portal: 'reference-insurer',
      status: 'active',
    });
    expect(body).toEqual({ portal: 'reference-insurer', amendments: [] });
  });
});
