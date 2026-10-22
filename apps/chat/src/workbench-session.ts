// The Workbench assistant's session (spec 043 T017, D-1, D-5): its prompt and tools from
// `apps/chat/agents/workbench.md`, the crawler subagent only, the three MCP servers (the chat one
// in Workbench mode), and its fence: read tools and the two Workbench tools, and the crawler only
// with a prompt a confirmed command handed over, once (F-10). Nothing else is allowed.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NewSessionRequest } from '@agentclientprotocol/sdk';
import type { PermissionDecision, PermissionPolicy } from './acp-client.js';
import {
  AGENT_TOOL,
  BA_READ_TOOLS,
  createFence,
  HARNESS_TOOLS,
  REFUSAL,
  type FenceOptions,
} from './fence.js';
import { buildSessionRequest, readAgentFile, type SessionConfigOptions } from './session-config.js';

export const WORKBENCH_TOOLS = ['render_view', 'propose_command'].map(
  (t) => `mcp__mudpuppy-chat__${t}`,
);

export function workbenchFile(repoRoot: string): string {
  return join(repoRoot, 'apps', 'chat', 'agents', 'workbench.md');
}

/**
 * The orchestrator's session with the Workbench prompt and tools: the same MCP servers and the
 * crawler subagent, the chat server started in Workbench mode (`MUDPUPPY_CHAT_KIND`).
 */
export function buildWorkbenchSessionRequest(opts: SessionConfigOptions): NewSessionRequest {
  const base = buildSessionRequest(opts);
  const workbench = readAgentFile(workbenchFile(opts.repoRoot));
  const meta = base._meta as {
    claudeCode: { options: Record<string, unknown> & { agents: Record<string, unknown> } };
  };
  const options = meta.claudeCode.options;
  const cwd = join(opts.repoRoot, 'apps', 'chat', 'runtime');
  mkdirSync(cwd, { recursive: true });
  return {
    ...base,
    mcpServers: base.mcpServers.map((s) =>
      'env' in s && s.name === 'mudpuppy-chat'
        ? { ...s, env: [...s.env, { name: 'MUDPUPPY_CHAT_KIND', value: 'workbench' }] }
        : s,
    ),
    _meta: {
      claudeCode: {
        options: {
          ...options,
          systemPrompt: workbench.body,
          tools: workbench.tools.filter((t) => !t.startsWith('mcp__')),
          agents: { crawler: options.agents.crawler },
        },
      },
    },
  };
}

const norm = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Crawler prompts confirmed commands handed over, per conversation; each starts the crawler once. */
export class Launches {
  private readonly pending = new Map<string, string[]>();

  allow(conversationId: string, prompt: string): void {
    this.pending.set(conversationId, [...(this.pending.get(conversationId) ?? []), norm(prompt)]);
  }

  /** True once for a prompt that was allowed (whitespace aside); it is used up. */
  consume(conversationId: string, prompt: unknown): boolean {
    const list = this.pending.get(conversationId) ?? [];
    const i = typeof prompt === 'string' ? list.indexOf(norm(prompt)) : -1;
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }
}

function deny(text: string): PermissionDecision {
  return { allow: false, reason: `${REFUSAL.notAllowed}: ${text}` };
}

const READ_AND_COMPOSE: ReadonlySet<string> = new Set([...WORKBENCH_TOOLS, ...BA_READ_TOOLS]);

/** The Workbench fence: one per conversation, over the chat's fence for the crawler's own calls. */
export function createWorkbenchFence(
  opts: FenceOptions,
  conversationId: string,
  launches: Launches,
): PermissionPolicy {
  const base = createFence(opts);
  return (q) => {
    const tool = q.tool;
    if (tool === null || HARNESS_TOOLS.has(tool) || q.parentToolCallId !== null) return base(q);
    if (tool === AGENT_TOOL) {
      const input = (typeof q.rawInput === 'object' && q.rawInput !== null ? q.rawInput : {}) as {
        subagent_type?: unknown;
        prompt?: unknown;
      };
      if (input.subagent_type !== 'crawler')
        return deny('the Workbench starts only the crawler, and only after a person confirms');
      if (!launches.consume(conversationId, input.prompt))
        return deny('a scan starts only from a command card the person confirmed');
      return { allow: true, reason: 'confirmed command' };
    }
    if (READ_AND_COMPOSE.has(tool)) return { allow: true, reason: 'allowlisted' };
    return deny(`the Workbench may not use ${tool}; every write is a command card`);
  };
}
