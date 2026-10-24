/**
 * One headless agent session: `claude -p --agent <crawler|ba>` with only that agent's MCP server.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalConfig } from '../config.js';
import { abort, EXIT_USAGE_LIMIT } from '../failures.js';
import { classifyOutcome, isScored, type ScoredOutcome } from './outcome.js';

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
  crawler: 'mcp__mudpuppy',
  ba: 'mcp__mudpuppy-ba',
};

/** The eval process removes its MCP config file when it exits (set on the first write). */
let cleanupSet = false;

interface McpConfig {
  mcpServers: Record<string, { env?: Record<string, string> } & Record<string, unknown>>;
}

/**
 * The repo's `.mcp.json` with every server on the eval's environment (spec 045 F-02): since spec
 * 044 it names `local-dev`, and a server's own `env` wins over the process's, so the servers
 * opened the developer's store kind instead of the workspace's and closed.
 */
export function evalMcpConfig(root: string, ws: string, env: string): string {
  const repo = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')) as McpConfig;
  const servers = Object.fromEntries(
    Object.entries(repo.mcpServers).map(([name, s]) => [
      name,
      { ...s, env: { ...s.env, MUDPUPPY_ENV: env, MUDPUPPY_ROOT: ws } },
    ]),
  );
  // Not in `ws`: with `--in-place` that is the repo root. One file per eval process, removed when
  // it exits (R-97 (8)).
  const path = join(tmpdir(), `pf-eval-mcp-${String(process.pid)}.json`);
  if (!cleanupSet) process.once('exit', () => rmSync(path, { force: true }));
  cleanupSet = true;
  writeFileSync(path, JSON.stringify({ mcpServers: servers }, null, 2));
  return path;
}

function cliArgs(
  config: EvalConfig,
  ws: string,
  agent: AgentName,
  prompt: string,
  sessionId: string,
) {
  return [
    ...['-p', prompt, '--agent', agent, '--session-id', sessionId],
    ...['--output-format', 'json', '--max-budget-usd', config.budgetUsd],
    ...['--mcp-config', evalMcpConfig(config.root, ws, config.env), '--strict-mcp-config'],
    // Only the agent's own server: every tool of it, nothing else.
    ...['--allowedTools', AGENT_SERVER[agent]],
    ...(config.model ? ['--model', config.model] : []),
  ];
}

/** A session that may be scored, with how it ended. */
export interface AgentRun {
  out: CliOut;
  outcome: ScoredOutcome;
}

/** Run one agent in workspace `ws`; `sessionId` names its transcript for the password sweep. */
export function runAgent(
  config: EvalConfig,
  ws: string,
  agent: AgentName,
  prompt: string,
  sessionId: string,
): AgentRun {
  const r = spawnSync('claude', cliArgs(config, ws, agent, prompt, sessionId), {
    cwd: config.root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, MUDPUPPY_ENV: config.env, MUDPUPPY_ROOT: ws },
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
  const outcome = classifyOutcome(out);
  if (!isScored(outcome))
    abort(
      `${agent} session ${sessionId} ended with ${outcome.replace('_', ' ')} (${out.subtype ?? 'no subtype'}): ${(out.result ?? '').slice(0, 300)}; no result written`,
      outcome === 'usage_limit' ? EXIT_USAGE_LIMIT : 2,
    );
  return { out, outcome };
}
