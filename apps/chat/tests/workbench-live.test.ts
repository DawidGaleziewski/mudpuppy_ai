// Spec 075 (the R-96 spike): the live Workbench in the chat service. A live conversation's
// assistant has its own prompt and no subagent; a confirmed scan runs in the scan runner, whose
// only move is the confirmed crawler start; milestones reach the assistant once each; a choice's
// answer and a card the person asked for come in as actions.

import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatEvent } from '../src/events.js';
import { ScanRunner } from '../src/scan-runner.js';
import { liveAction } from '../src/workbench-actions.js';
import { answerText, AskChoiceInput, choiceOf, storeChoice } from '../src/workbench-choices.js';
import {
  buildLiveSessionRequest,
  buildRunnerSessionRequest,
  createRunnerFence,
  isLive,
  LIVE_GOAL,
} from '../src/workbench-live.js';
import { dueMilestones, markTold, milestoneText, SETTLE_MS } from '../src/workbench-milestones.js';
import { createWorkbenchService } from '../src/workbench-service.js';
import { createWorkbenchFence, Launches } from '../src/workbench-session.js';
import { currentTurn } from '../src/workbench-turn.js';
import { fakeAgent } from './fake-agent.js';
import { memoryStore, testService, until } from './helpers.js';

const repo = join(import.meta.dirname, '..', '..', '..');
const P = 'reference-insurer';
const CONV = '0199a000-0000-7000-8000-0000000000c1';
const RUN = '01a110d5-0000-7000-8000-000000000001';

type Mem = ReturnType<typeof memoryStore>;

function conversation(mem: Mem, goal: string = LIVE_GOAL, id = CONV): void {
  mem.opened.raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, status, created_at, updated_at, kind)
       VALUES (?, ?, ?, 'active', '2026-10-06T10:00:00.000Z', '2026-10-06T10:00:00.000Z', 'workbench')`,
    )
    .run(id, P, goal);
}

function addRun(mem: Mem, status: string, warning: string | null = null): void {
  mem.opened.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
         locale, browser, config_snapshot, status, started_at, warning)
       VALUES (?, ?, 'guest', 'map', 'local-dev', 'd', 'v', 'l', 'b', '{}', ?, '2026-10-06T10:00:00Z', ?)`,
    )
    .run(RUN, P, status, warning);
}

function doneStart(mem: Mem, result: Record<string, unknown> = { run_id: RUN }): string {
  const id = '0199a000-0000-7000-8000-0000000000d1';
  mem.opened.raw
    .prepare(
      `INSERT INTO workbench_commands (id, conversation_id, turn, command, args_json, reason, source, state,
         token_hash, precondition_hash, idempotency_key, expires_at, confirmed_by, confirmed_at, result_json,
         created_at, updated_at)
       VALUES (?, ?, 1, 'scan.start', '{}', 'r', 'assistant', 'done', ?, 'h', 'k', 'x', 'dawid', 'x', ?, 'x', 'x')`,
    )
    .run(id, CONV, 'a'.repeat(64), JSON.stringify(result));
  return id;
}

describe('live conversations and their sessions', () => {
  it('a live conversation is a Workbench conversation with the live goal', () => {
    const mem = memoryStore();
    conversation(mem);
    conversation(mem, 'workbench', '0199a000-0000-7000-8000-0000000000c2');
    expect(isLive(mem.opened.raw, CONV)).toBe(true);
    expect(isLive(mem.opened.raw, '0199a000-0000-7000-8000-0000000000c2')).toBe(false);
  });

  it('the live assistant gets its own prompt, no subagent, and the chat server in live mode', () => {
    const req = buildLiveSessionRequest({ repoRoot: repo, conversationId: CONV, environment: 'local-dev' });
    const options = (req._meta as { claudeCode: { options: Record<string, unknown> } }).claudeCode.options;
    expect(options.systemPrompt).toContain('ask_choice');
    expect(options.systemPrompt).toContain('runs in the background');
    expect(options.agents).toEqual({});
    expect(options.tools).toEqual([]);
    const chat = req.mcpServers.find((s) => s.name === 'mudpuppy-chat') as { env: { name: string; value: string }[] };
    expect(chat.env).toContainEqual({ name: 'MUDPUPPY_CHAT_KIND', value: 'workbench-live' });
    // no crawler server, so no Chromium per live conversation (F-04)
    expect(req.mcpServers.map((s) => s.name).sort()).toEqual(['mudpuppy-ba', 'mudpuppy-chat']);
  });

  it("the runner's session has the crawler and only the Agent tool", () => {
    const req = buildRunnerSessionRequest({ repoRoot: repo, conversationId: CONV, environment: 'local-dev' });
    const options = (req._meta as { claudeCode: { options: Record<string, unknown> } }).claudeCode.options;
    expect(options.tools).toEqual(['Agent']);
    expect(Object.keys(options.agents as object)).toEqual(['crawler']);
    expect(options.systemPrompt).toContain('do not run it in the background');
  });
});

describe("the runner's fence", () => {
  const ask = (tool: string, rawInput: unknown = {}, parent: string | null = null) => ({
    tool,
    title: tool,
    rawInput,
    parentToolCallId: parent,
    parentAgent: parent === null ? null : 'crawler',
    toolCallId: 'x',
  });

  it('starts the crawler only with the confirmed prompt, once, and nothing else of its own', () => {
    const launches = new Launches();
    const fence = createRunnerFence({ repoRoot: repo }, CONV, launches);
    expect(fence(ask('Agent', { subagent_type: 'crawler', prompt: 'map it' })).allow).toBe(false);
    launches.allow(CONV, 'map it');
    expect(fence(ask('mcp__mudpuppy-chat__render_view')).allow).toBe(false);
    expect(fence(ask('mcp__mudpuppy-ba__list_runs')).allow).toBe(false);
    expect(fence(ask('Agent', { subagent_type: 'crawler', prompt: 'map  it' })).allow).toBe(true);
    expect(fence(ask('Agent', { subagent_type: 'crawler', prompt: 'map it' })).allow).toBe(false);
    // the crawler's own calls go by the chat's fence
    expect(fence(ask('mcp__mudpuppy__navigate', {}, 'agent-1')).allow).toBe(true);
  });

  it("the live assistant's fence allows ask_choice and never the crawler (F-06)", () => {
    const fence = createWorkbenchFence({ repoRoot: repo }, CONV, new Launches());
    expect(fence(ask('mcp__mudpuppy-chat__ask_choice')).allow).toBe(true);
    expect(fence(ask('Agent', { subagent_type: 'crawler', prompt: 'map it' })).allow).toBe(false);
  });
});

describe('the scan runner', () => {
  let events: ChatEvent[];
  let agent: ReturnType<typeof fakeAgent>;
  let launches: Launches;
  let runner: ScanRunner;

  beforeEach(() => {
    events = [];
    agent = fakeAgent();
    launches = new Launches();
    runner = new ScanRunner({
      launch: agent.launch,
      sessionRequest: () => ({ cwd: '/tmp/mudpuppy-chat-runtime', mcpServers: [] }),
      policy: (id) => createRunnerFence({ repoRoot: repo }, id, launches),
      onEvent: (_id, e) => events.push(e),
      logError: () => Promise.resolve({ ref: 'ERR-TEST', logged: true }),
    });
  });

  afterEach(() => runner.close());

  const crawl = (prompt: string) =>
    `call ${JSON.stringify({ tool: 'Agent', rawInput: { subagent_type: 'crawler', prompt }, say: 'done' })}`;

  it('runs the confirmed crawler start in its own session and forwards its tool events, not its words', async () => {
    launches.allow(CONV, 'map it');
    const running = runner.run(CONV, crawl('map it'));
    expect(runner.busy(CONV)).toBe(true);
    await expect(runner.run(CONV, crawl('map it'))).rejects.toThrow('already runs');
    await running;
    expect(runner.busy(CONV)).toBe(false);
    expect(agent.log.permissionOutcomes).toEqual(['Agent:allow']);
    expect(events.map((e) => e.type)).toEqual(['tool_started', 'tool_finished', 'idle']);
  });

  it('a prompt nobody confirmed is refused', async () => {
    await runner.run(CONV, crawl('map everything'));
    expect(agent.log.permissionOutcomes).toEqual(['Agent:reject']);
  });
});

describe('milestones', () => {
  it('a live scan is told started once, then its end once, with the facts from the store', () => {
    const mem = memoryStore();
    conversation(mem);
    addRun(mem, 'running');
    const id = doneStart(mem);
    const [started] = dueMilestones(mem.opened.raw);
    expect(started).toMatchObject({ commandId: id, conversationId: CONV, told: 'started' });
    expect(started?.text).toBe(`[event] Scan 01a110d5-0000 (${RUN}) started as guest on local-dev.`);
    markTold(mem.opened.raw, started!);
    expect(dueMilestones(mem.opened.raw)).toEqual([]);
    const end = '2026-10-06T10:05:00.000Z';
    mem.opened.raw
      .prepare(`UPDATE runs SET status = 'interrupted', warning = 'portal down', ended_at = ? WHERE id = ?`)
      .run(end, RUN);
    // the crawler's last writes land just after: not told until it settled (F-07)
    expect(dueMilestones(mem.opened.raw, Date.parse(end) + 1000)).toEqual([]);
    const [ended] = dueMilestones(mem.opened.raw, Date.parse(end) + SETTLE_MS);
    expect(ended?.text).toBe(
      `[event] Scan 01a110d5-0000 (${RUN}) stopped: 0 pages recorded, 0 links still queued. Why: portal down.`,
    );
    markTold(mem.opened.raw, ended!);
    expect(dueMilestones(mem.opened.raw)).toEqual([]);
  });

  it('only live conversations get milestones', () => {
    const mem = memoryStore();
    conversation(mem, 'workbench');
    addRun(mem, 'running');
    doneStart(mem);
    expect(dueMilestones(mem.opened.raw)).toEqual([]);
  });

  it('a finished scan says finished; a stop the person made says so (F-08)', () => {
    const facts = { status: 'completed', persona_id: 'guest', environment: 'sandbox', warning: null, pages: 3, queued: 0, ended_at: null, stopped_by_you: 0 };
    expect(milestoneText(RUN, 'ended', facts)).toContain('finished: 3 pages recorded');
    const stopped = { ...facts, status: 'interrupted', stopped_by_you: 1 };
    expect(milestoneText(RUN, 'ended', stopped)).toContain('stopped: 3 pages recorded, 0 links still queued. Why: the person pressed Stop.');
  });
});

describe('choices', () => {
  it('options are for kind answer only', () => {
    expect(AskChoiceInput.safeParse({ kind: 'portal', question: 'Which portal?' }).success).toBe(true);
    expect(AskChoiceInput.safeParse({ kind: 'answer', question: 'Which?' }).success).toBe(false);
    const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
    expect(AskChoiceInput.safeParse({ kind: 'store', question: 'Which?', options: opts }).success).toBe(false);
    expect(AskChoiceInput.safeParse({ kind: 'answer', question: 'Which?', options: opts }).success).toBe(true);
  });

  it('a choice is a system message that does not count as a turn', () => {
    const mem = memoryStore();
    conversation(mem);
    const choice = storeChoice(mem.opened.raw, CONV, 1, { kind: 'store', question: 'Which store?' });
    storeChoice(mem.opened.raw, CONV, 1, { kind: 'portal', question: 'Which portal?' });
    expect(choiceOf(mem.opened.raw, CONV, choice.id)).toEqual(choice);
    expect(currentTurn(mem.opened.raw, CONV)).toBe(1);
    expect(answerText(choice, 'sandbox', 'Sandbox')).toBe(
      '[event] The person answered "Which store?" (store): Sandbox (sandbox).',
    );
  });
});

describe('live actions', () => {
  let t: ReturnType<typeof testService>;
  let workbench: ReturnType<typeof createWorkbenchService>;

  beforeEach(() => {
    t = testService();
    conversation(t);
    workbench = createWorkbenchService({
      raw: t.opened.raw,
      service: t.service,
      paths: { repoRoot: repo },
      launches: new Launches(),
      telemetry: () => undefined,
      live: (id) => isLive(t.opened.raw, id),
    });
  });

  afterEach(() => t.service.close());

  it("an answer to the assistant's own options is checked, then told to it", async () => {
    const choice = storeChoice(t.opened.raw, CONV, 1, {
      kind: 'answer',
      question: 'Which part first?',
      options: [{ value: 'calc', label: 'The calculator' }, { value: 'claims', label: 'Claims' }],
    });
    await expect(
      workbench.action(CONV, { name: 'choice.answer', context: { choice: choice.id, value: 'other' } }),
    ).rejects.toThrow('Pick one of the options');
    await workbench.action(CONV, { name: 'choice.answer', context: { choice: choice.id, value: 'calc' } });
    await until(() => t.log.prompts.length === 1);
    expect(t.log.prompts[0]).toContain('[event] The person answered "Which part first?" (answer): The calculator (calc).');
  });

  it('a new persona from the screen is an editable card, not a write', async () => {
    const out = (await workbench.action(CONV, { name: 'persona.new', context: { name: 'agent-anna' } })) as { command_id: string };
    const row = t.opened.raw.prepare(`SELECT command, state, source, args_json FROM workbench_commands WHERE id = ?`).get(out.command_id);
    expect(row).toEqual({ command: 'persona.add', state: 'proposed', source: 'button', args_json: '{"name":"agent-anna"}' });
  });

  it('a confirmed start goes to the scan runner; the assistant is only told (FR-002)', async () => {
    const runs: [string, string][] = [];
    const runner = { run: (id: string, text: string) => (runs.push([id, text]), Promise.resolve()) } as unknown as ScanRunner;
    const launches = new Launches();
    const live = createWorkbenchService({ ...wbDeps(t), launches, runner, live: (id) => isLive(t.opened.raw, id) });
    const { id } = live.proposeFromButton({ conversation_id: CONV, command: 'scan.start', args: { type: 'full_map', persona: 'guest' } });
    const { token } = live.token(id);
    expect(live.confirm(id, { token, by: 'dawid' })).toEqual({ state: 'running' });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.[0]).toBe(CONV);
    expect(runs[0]?.[1]).toContain('Start the crawler agent with exactly this prompt');
    await until(() => t.log.prompts.length === 1);
    expect(t.log.prompts[0]).toContain('The scan runs in the background');
    expect(t.log.prompts[0]).not.toContain('exactly this prompt');
  });

  it('actions are for live conversations only, and unknown ones are refused', async () => {
    const other = '0199a000-0000-7000-8000-0000000000c3';
    conversation(t, 'workbench', other);
    await expect(liveAction({ ...wbDeps(t), live: () => false }, workbench, other, { name: 'persona.new' })).rejects.toThrow('live Workbench');
    await expect(workbench.action(CONV, { name: 'rm.rf' })).rejects.toThrow('not known');
  });
});

function wbDeps(t: ReturnType<typeof testService>) {
  return {
    raw: t.opened.raw,
    service: t.service,
    paths: { repoRoot: repo },
    launches: new Launches(),
    telemetry: () => undefined,
  };
}
