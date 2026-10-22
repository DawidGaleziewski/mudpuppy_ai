/**
 * One headless assistant session: `claude -p` with the orchestrator's own system prompt and only
 * the chat server's two grouping tools (spec 038 FR-002). No other tool, so the assistant groups
 * from what `list_grouping_inputs` returns, as in the chat; it cannot read the ground truth.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { orchestratorFile, readAgentFile } from '../../src/session-config.js';
import type { EvalConfig } from '../config.js';
import { abort, EXIT_USAGE_LIMIT } from '../failures.js';
import type { Workspace } from './workspace.js';

export const GROUPING_TOOLS = [
  'mcp__mudpuppy-chat__list_grouping_inputs',
  'mcp__mudpuppy-chat__suggest_grouping',
] as const;

/** Built-in tools the session must not use (the agent harness offers them by default). */
const OFF = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'Task'];

/** The fields of `claude --output-format json` the eval reads. */
export interface CliOut {
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  subtype?: string;
}

export type AgentOutcome = 'success' | 'budget_end' | 'api_error' | 'usage_limit';

/** The CLI's answer when the account's session or rate limit cuts the agent off. */
const LIMIT = /hit your .*limit|usage limit|rate.?limit/i;

export function classifyOutcome(out: CliOut): AgentOutcome {
  if (LIMIT.test(out.result ?? '')) return 'usage_limit';
  if (out.subtype === 'error_max_budget_usd') return 'budget_end';
  if (out.is_error === true) return 'api_error';
  return 'success';
}

export function cliArgs(config: EvalConfig, ws: Workspace, prompt: string, sessionId: string) {
  const orchestrator = readAgentFile(orchestratorFile(config.root));
  return [
    ...['-p', prompt, '--session-id', sessionId, '--system-prompt', orchestrator.body],
    ...['--output-format', 'json', '--max-budget-usd', config.budgetUsd],
    ...['--mcp-config', join(ws.dir, '.mcp.json'), '--strict-mcp-config'],
    ...['--allowedTools', GROUPING_TOOLS.join(','), '--disallowedTools', OFF.join(',')],
    ...(config.model ? ['--model', config.model] : []),
  ];
}

/** Run the session in the workspace; an outage or the usage limit aborts (no result). */
export function runAssistant(
  config: EvalConfig,
  ws: Workspace,
  prompt: string,
  sessionId: string,
): { out: CliOut; outcome: AgentOutcome } {
  const r = spawnSync('claude', cliArgs(config, ws, prompt, sessionId), {
    cwd: ws.dir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let out: CliOut;
  try {
    out = JSON.parse(r.stdout) as CliOut;
  } catch {
    return abort(`assistant run gave no JSON (exit ${String(r.status)}): ${r.stderr.slice(-800)}`);
  }
  const outcome = classifyOutcome(out);
  if (outcome === 'usage_limit' || outcome === 'api_error')
    abort(
      `assistant session ${sessionId} ended with ${outcome}: ${(out.result ?? '').slice(0, 300)}; no result written`,
      outcome === 'usage_limit' ? EXIT_USAGE_LIMIT : 2,
    );
  return { out, outcome };
}
