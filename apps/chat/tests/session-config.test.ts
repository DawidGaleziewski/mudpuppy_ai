import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HARNESS_TOOLS, ORCHESTRATOR_TOOLS } from '../src/fence.js';
import { buildSessionRequest, orchestratorFile, readAgentFile } from '../src/session-config.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

interface Options {
  systemPrompt: string;
  settingSources: string[];
  tools: string[];
  disallowedTools: string[];
  agents: Record<string, { prompt: string; tools: string[]; description: string }>;
  allowDangerouslySkipPermissions: boolean;
}

function options(): Options {
  const req = buildSessionRequest({ repoRoot, conversationId: 'conv-1', environment: 'sandbox' });
  return (req._meta as { claudeCode: { options: Options } }).claudeCode.options;
}

describe('buildSessionRequest', () => {
  it('runs in an isolated session with the orchestrator prompt and only the Agent tool', () => {
    const o = options();
    expect(o.settingSources).toEqual([]);
    expect(o.tools).toEqual(['Agent']);
    expect(o.allowDangerouslySkipPermissions).toBe(false);
    expect(o.systemPrompt).toContain("You are MudPuppy's guide");
    expect(o.systemPrompt).not.toContain('---');
    for (const t of ['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch'])
      expect(o.disallowedTools).toContain(t);
    expect(new Set(o.disallowedTools)).toEqual(HARNESS_TOOLS);
  });

  it('defines exactly the crawler and ba subagents from their agent files', () => {
    const o = options();
    expect(Object.keys(o.agents).sort()).toEqual(['ba', 'crawler']);
    const crawler = readAgentFile(resolve(repoRoot, '.claude/agents/crawler.md'));
    expect(o.agents.crawler?.tools).toEqual(crawler.tools);
    // ba preloads its ba-practice skill text (skills cannot be discovered with settingSources [])
    expect(o.agents.ba?.prompt).toContain('seven');
  });

  it('passes the three MCP servers and the conversation to pathfinder-chat', () => {
    const req = buildSessionRequest({ repoRoot, conversationId: 'conv-1', environment: 'staging' });
    expect(req.cwd).toBe(resolve(repoRoot, 'apps/chat/runtime'));
    const servers = req.mcpServers as { name: string; env: { name: string; value: string }[] }[];
    expect(servers.map((s) => s.name)).toEqual(['pathfinder', 'pathfinder-ba', 'pathfinder-chat']);
    expect(servers[2]?.env).toContainEqual({
      name: 'PATHFINDER_CHAT_CONVERSATION',
      value: 'conv-1',
    });
    for (const s of servers)
      expect(s.env).toContainEqual({ name: 'PATHFINDER_ENV', value: 'staging' });
  });

  it('the orchestrator file lists exactly the fence allowlist', () => {
    const file = readAgentFile(orchestratorFile(repoRoot));
    expect([...file.tools].sort()).toEqual([...ORCHESTRATOR_TOOLS].sort());
  });
});
