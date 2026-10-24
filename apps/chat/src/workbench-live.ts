// The live Workbench (spec 075, the R-96 spike): a Workbench conversation whose scans run in the
// background. Its assistant gets `agents/workbench-live.md` (the same views and commands, plus
// `ask_choice`), no subagent, and the chat MCP server in live mode; a confirmed scan goes to the
// scan runner (`scan-runner.ts`) instead of the assistant's own turn (spec 043 F-19, D-5).

import type BetterSqlite3 from 'better-sqlite3';
import type { NewSessionRequest } from '@agentclientprotocol/sdk';
import { join } from 'node:path';
import type { PermissionPolicy } from './acp-client.js';
import { AGENT_TOOL, HARNESS_TOOLS, REFUSAL, type FenceOptions } from './fence.js';
import { RUNNER_PROMPT } from './scan-runner.js';
import { readAgentFile, type SessionConfigOptions } from './session-config.js';
import { buildWorkbenchSessionRequest, createWorkbenchFence, type Launches } from './workbench-session.js';

/** `chat_conversations.goal` of a live Workbench conversation (no migration: `goal` is free text). */
export const LIVE_GOAL = 'workbench-live';

/** `MUDPUPPY_CHAT_KIND` of the live assistant's chat MCP server: the Workbench tools and `ask_choice`. */
export const LIVE_KIND = 'workbench-live';

export function isLive(raw: BetterSqlite3.Database, conversationId: string): boolean {
  const row = raw
    .prepare(`SELECT goal, kind FROM chat_conversations WHERE id = ?`)
    .get(conversationId) as { goal: string; kind: string } | undefined;
  return row?.kind === 'workbench' && row.goal === LIVE_GOAL;
}

export function liveFile(repoRoot: string): string {
  return join(repoRoot, 'apps', 'chat', 'agents', 'workbench-live.md');
}

type ClaudeOptions = { claudeCode: { options: Record<string, unknown> } };

/** The live assistant's session: the Workbench session with the live prompt and no subagent. */
export function buildLiveSessionRequest(opts: SessionConfigOptions): NewSessionRequest {
  const base = buildWorkbenchSessionRequest(opts);
  const live = readAgentFile(liveFile(opts.repoRoot));
  const options = (base._meta as ClaudeOptions).claudeCode.options;
  return {
    ...base,
    // the crawler's server (and its Chromium) only in the scan runner's session, F-04
    mcpServers: base.mcpServers.filter((s) => s.name !== 'mudpuppy').map((s) =>
      'env' in s && s.name === 'mudpuppy-chat'
        ? {
            ...s,
            env: s.env.map((e) => (e.name === 'MUDPUPPY_CHAT_KIND' ? { ...e, value: LIVE_KIND } : e)),
          }
        : s,
    ),
    _meta: {
      claudeCode: {
        options: {
          ...options,
          systemPrompt: live.body,
          tools: live.tools.filter((t) => !t.startsWith('mcp__')),
          agents: {},
        },
      },
    },
  };
}

/** The scan runner's session: the Workbench session's servers and crawler, the runner's prompt. */
export function buildRunnerSessionRequest(opts: SessionConfigOptions): NewSessionRequest {
  const base = buildWorkbenchSessionRequest(opts);
  const options = (base._meta as ClaudeOptions).claudeCode.options;
  return {
    ...base,
    _meta: { claudeCode: { options: { ...options, systemPrompt: RUNNER_PROMPT, tools: [AGENT_TOOL] } } },
  };
}

/**
 * The runner's fence: the Workbench fence (the crawler only with the confirmed prompt, once; the
 * crawler's own calls by the chat's fence), and nothing else of its own: no view, no proposal.
 */
export function createRunnerFence(
  opts: FenceOptions,
  conversationId: string,
  launches: Launches,
): PermissionPolicy {
  const workbench = createWorkbenchFence(opts, conversationId, launches);
  return (q) => {
    const own = q.parentToolCallId === null && q.tool !== null && !HARNESS_TOOLS.has(q.tool);
    if (own && q.tool !== AGENT_TOOL)
      return { allow: false, reason: `${REFUSAL.notAllowed}: the scan runner only starts the crawler` };
    return workbench(q);
  };
}

/** What the live assistant hears when the person confirmed a scan: it runs without it. */
export function liveConfirmedText(label: string): string {
  return `[event] The person confirmed: ${label}. The scan runs in the background; its graph and progress are on the person's screen and update live. Say in one line that it is starting. You will get an event when it starts, finishes or stops.`;
}
