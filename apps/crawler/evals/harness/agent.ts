/**
 * One headless agent session: `claude -p --agent <crawler|ba>` with only that agent's MCP server.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { EvalConfig } from '../config.js';
import { abort } from '../failures.js';

export type AgentName = 'crawler' | 'ba';

/** The fields of `claude --output-format json` the eval reads. */
export interface CliOut {
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  is_error?: boolean;
  subtype?: string;
}

const AGENT_SERVER: Record<AgentName, string> = {
  crawler: 'mcp__pathfinder',
  ba: 'mcp__pathfinder-ba',
};

function cliArgs(config: EvalConfig, agent: AgentName, prompt: string, sessionId: string) {
  return [
    ...['-p', prompt, '--agent', agent, '--session-id', sessionId],
    ...['--output-format', 'json', '--max-budget-usd', config.budgetUsd],
    ...['--mcp-config', join(config.root, '.mcp.json'), '--strict-mcp-config'],
    // Only the agent's own server: every tool of it, nothing else.
    ...['--allowedTools', AGENT_SERVER[agent]],
    ...(config.model ? ['--model', config.model] : []),
  ];
}

/** Run one agent in workspace `ws`; `sessionId` names its transcript for the password sweep. */
export function runAgent(
  config: EvalConfig,
  ws: string,
  agent: AgentName,
  prompt: string,
  sessionId: string,
): CliOut {
  const r = spawnSync('claude', cliArgs(config, agent, prompt, sessionId), {
    cwd: config.root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATHFINDER_ENV: config.env, PATHFINDER_ROOT: ws },
  });
  let out: CliOut;
  try {
    out = JSON.parse(r.stdout) as CliOut;
  } catch {
    return abort(`${agent} run gave no JSON (exit ${r.status}): ${r.stderr.slice(-800)}`);
  }
  // An API error (account usage limit, overload) cuts the agent off mid-work: its scores would
  // measure the outage, not the agent, so there is no result at all (spec 014 F-04). Running out
  // of the eval's own budget is a fair end and stays a result (`crawler_completed`).
  const limited = /hit your .*limit|rate.?limit/i.test(out.result ?? '');
  if (limited || (out.is_error === true && out.subtype !== 'error_max_budget_usd'))
    abort(
      `${agent} session ${sessionId} ended with an error (${out.subtype ?? 'no subtype'}): ${(out.result ?? '').slice(0, 300)}; no result written`,
    );
  return out;
}
