// The fence (R-30 T013, FR-008, contracts/orchestrator-tools.md, research.md R2/R2b).
// Layer 2 of three: every permission request the agent sends is judged here. Deny by default:
// anything not on an allowlist is refused, and harness-changing tools get a clear refusal reason.
// The tool lists mirror `.claude/agents/crawler.md`, `ba.md` and `orchestrator.md`; tests check that.

import { isAbsolute, relative, resolve } from 'node:path';
import type { PermissionDecision, PermissionPolicy, PermissionQuery } from './acp-client.js';

const CHAT = 'mcp__pathfinder-chat__';
const BA = 'mcp__pathfinder-ba__';
const CRAWLER = 'mcp__pathfinder__';

export const CHAT_TOOLS = [
  'workflow_state',
  'list_process_candidates',
  'save_persona',
  'request_scan',
  'stop_scan',
  'set_process_scope',
  'request_documentation',
  'list_amendments',
  // Spec 022: the page the BA is looking at, and the browser actions on it.
  'page_context',
  'highlight_element',
  'open_page',
].map((t) => CHAT + t);

/** pathfinder-ba tools that only read; the orchestrator may use these itself. */
export const BA_READ_TOOLS = [
  'list_runs',
  'get_run_evidence',
  'get_evidence',
  'list_records',
  'get_record',
  'list_processes',
  'get_process',
  'get_pending_feedback',
].map((t) => BA + t);

export const BA_WRITE_TOOLS = [
  'start_session',
  'record_pass',
  'finish_session',
  'create_record',
  'revise_record',
  'withdraw_record',
  'address_crawler_question',
].map((t) => BA + t);

export const CRAWLER_TOOLS = [
  'start_run',
  'get_known_states',
  'get_next_frontier_item',
  'navigate',
  'act',
  'login',
  'add_open_question',
  'add_rule_candidate',
  'finish_run',
].map((t) => CRAWLER + t);

/** The built-in tool that starts a subagent. */
export const AGENT_TOOL = 'Agent';

export const SUBAGENTS = ['crawler', 'ba'] as const;
export type Subagent = (typeof SUBAGENTS)[number];

export const ORCHESTRATOR_TOOLS: readonly string[] = [AGENT_TOOL, ...CHAT_TOOLS, ...BA_READ_TOOLS];

/** Tools that change files, run commands or reach out: refused as harness changes, everywhere. */
export const HARNESS_TOOLS: ReadonlySet<string> = new Set([
  'Bash',
  'BashOutput',
  'KillShell',
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Skill',
  'SlashCommand',
  'ExitPlanMode',
  'TodoWrite',
]);

/** The BA subagent may Read its method references only (mirrors `.claude/hooks/ba-guard.py`). */
export const BA_READ_ROOT = '.claude/skills/ba-practice/references';

export interface FenceOptions {
  /** Absolute repo root, for path checks. */
  repoRoot: string;
}

export const REFUSAL = {
  harness: 'HARNESS_CHANGE_REFUSED',
  notAllowed: 'NOT_ALLOWED',
} as const;

function deny(code: string, text: string): PermissionDecision {
  return { allow: false, reason: `${code}: ${text}` };
}

const ALLOW: PermissionDecision = { allow: true, reason: 'allowlisted' };

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function readTarget(rawInput: unknown): string | null {
  if (typeof rawInput !== 'object' || rawInput === null) return null;
  const p = (rawInput as { file_path?: unknown }).file_path;
  return typeof p === 'string' ? p : null;
}

function judgeSubagentCall(
  q: PermissionQuery,
  agent: Subagent,
  opts: FenceOptions,
): PermissionDecision {
  const tool = q.tool ?? '';
  if (agent === 'crawler')
    return CRAWLER_TOOLS.includes(tool)
      ? ALLOW
      : deny(REFUSAL.notAllowed, `the crawler may only use the pathfinder tools, not ${tool}`);
  if (BA_READ_TOOLS.includes(tool) || BA_WRITE_TOOLS.includes(tool)) return ALLOW;
  if (tool === 'Read') {
    const target = readTarget(q.rawInput);
    const root = resolve(opts.repoRoot, BA_READ_ROOT);
    if (target !== null && inside(root, resolve(opts.repoRoot, target))) return ALLOW;
    return deny(
      REFUSAL.notAllowed,
      `the BA may only read its method references, not ${target ?? '?'}`,
    );
  }
  return deny(REFUSAL.notAllowed, `the BA may only use the pathfinder-ba tools, not ${tool}`);
}

export function createFence(opts: FenceOptions): PermissionPolicy {
  return (q) => {
    const tool = q.tool;
    if (tool === null) return deny(REFUSAL.notAllowed, `unknown tool for "${q.title}"`);
    if (HARNESS_TOOLS.has(tool))
      return deny(
        REFUSAL.harness,
        `${tool} can change files or run commands; harness changes are done by a developer in the shell`,
      );

    if (q.parentToolCallId !== null) {
      const agent = q.parentAgent;
      if (agent === null || !(SUBAGENTS as readonly string[]).includes(agent))
        return deny(
          REFUSAL.notAllowed,
          `calls from subagent ${agent ?? 'unknown'} are not allowed`,
        );
      return judgeSubagentCall(q, agent as Subagent, opts);
    }

    if (tool === AGENT_TOOL) {
      const type =
        typeof q.rawInput === 'object' && q.rawInput !== null
          ? (q.rawInput as { subagent_type?: unknown }).subagent_type
          : undefined;
      if (typeof type === 'string' && (SUBAGENTS as readonly string[]).includes(type)) return ALLOW;
      return deny(
        REFUSAL.notAllowed,
        `only the crawler and ba agents can be started, not ${String(type)}`,
      );
    }
    if (ORCHESTRATOR_TOOLS.includes(tool)) return ALLOW;
    if (BA_WRITE_TOOLS.includes(tool) || CRAWLER_TOOLS.includes(tool))
      return deny(REFUSAL.notAllowed, `${tool} runs only inside the crawler or ba agent`);
    return deny(REFUSAL.notAllowed, `${tool} is not on the assistant's list`);
  };
}
