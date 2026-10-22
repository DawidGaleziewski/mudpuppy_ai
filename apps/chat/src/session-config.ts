// Build the `session/new` request for the orchestrator (R-30 T016, research.md R2 "Corrected in
// T012"). The Claude ACP adapter spreads `_meta.claudeCode.options` into the Agent SDK options, so
// the orchestrator is assembled here: its prompt and allowlist from `apps/chat/agents/orchestrator.md`,
// the `crawler` and `ba` subagents from their `.claude/agents/*.md` files (single source), isolated
// settings, and the three MCP servers.

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer, NewSessionRequest } from '@agentclientprotocol/sdk';
import { parse } from 'yaml';
import { HARNESS_TOOLS } from './fence.js';

export interface AgentFile {
  name: string;
  description: string;
  tools: string[];
  model: string | null;
  skills: string[];
  body: string;
}

/** Parse a Claude agent file: YAML frontmatter between `---` lines, markdown body. */
export function readAgentFile(path: string): AgentFile {
  const text = readFileSync(path, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (m === null) throw new Error(`${path}: no frontmatter`);
  const front = parse(m[1] ?? '') as Record<string, unknown>;
  const list = (v: unknown): string[] =>
    typeof v === 'string'
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '')
      : Array.isArray(v)
        ? v.map(String)
        : [];
  return {
    name: String(front.name ?? ''),
    description: String(front.description ?? ''),
    tools: list(front.tools),
    model: typeof front.model === 'string' ? front.model : null,
    skills: list(front.skills),
    body: (m[2] ?? '').trim(),
  };
}

/** A skill's SKILL.md without its frontmatter, for preloading into a subagent prompt. */
function skillText(repoRoot: string, skill: string): string {
  const text = readFileSync(join(repoRoot, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
  return text.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

export interface SessionConfigOptions {
  repoRoot: string;
  conversationId: string;
  environment: string;
}

function stdio(
  name: string,
  command: string,
  args: string[],
  env: Record<string, string>,
): McpServer {
  return {
    name,
    command,
    args,
    env: Object.entries(env).map(([k, v]) => ({ name: k, value: v })),
  };
}

export function orchestratorFile(repoRoot: string): string {
  return join(repoRoot, 'apps', 'chat', 'agents', 'orchestrator.md');
}

export function buildSessionRequest(opts: SessionConfigOptions): NewSessionRequest {
  const { repoRoot, conversationId, environment } = opts;
  const orchestrator = readAgentFile(orchestratorFile(repoRoot));
  const agents: Record<string, unknown> = {};
  for (const name of ['crawler', 'ba']) {
    const a = readAgentFile(join(repoRoot, '.claude', 'agents', `${name}.md`));
    // Skills cannot be discovered with settingSources [] (isolation), so preload their text, which
    // is what the `skills:` frontmatter does in a normal session.
    const prompt = [a.body, ...a.skills.map((s) => skillText(repoRoot, s))].join('\n\n');
    agents[name] = {
      description: a.description,
      prompt,
      tools: a.tools,
      ...(a.model === null ? {} : { model: a.model }),
    };
  }

  const cwd = join(repoRoot, 'apps', 'chat', 'runtime');
  mkdirSync(cwd, { recursive: true });
  const crawlerDir = join(repoRoot, 'apps', 'crawler');
  const env = { MUDPUPPY_ENV: environment, MUDPUPPY_ROOT: repoRoot };
  return {
    cwd,
    mcpServers: [
      stdio(
        'mudpuppy',
        'pnpm',
        ['--dir', crawlerDir, '--filter', '@mudpuppy/mcp-server', 'start'],
        env,
      ),
      stdio(
        'mudpuppy-ba',
        'pnpm',
        ['--dir', crawlerDir, '--filter', '@mudpuppy/mcp-server', 'start:ba'],
        env,
      ),
      stdio('mudpuppy-chat', 'pnpm', ['--dir', join(repoRoot, 'apps', 'chat'), 'run', 'mcp'], {
        ...env,
        MUDPUPPY_CHAT_CONVERSATION: conversationId,
      }),
    ],
    _meta: {
      claudeCode: {
        options: {
          systemPrompt: orchestrator.body,
          settingSources: [],
          tools: orchestrator.tools.filter((t) => !t.startsWith('mcp__')),
          disallowedTools: [...HARNESS_TOOLS],
          agents,
          allowDangerouslySkipPermissions: false,
        },
      },
    },
  };
}
