import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_TOOL_NAMES, createServer, type Runtime } from '../src/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { makeCtx } from './helpers.js';

const repoFile = (p: string) => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));

function frontmatter(path: string): Record<string, unknown> {
  const text = readFileSync(path, 'utf8');
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) throw new Error(`${path} has no frontmatter`);
  // flat `key: value` frontmatter (no nesting is used in agent files)
  return Object.fromEntries(
    m[1]!
      .split('\n')
      .map((l) => /^([A-Za-z_-]+):\s*(.*)$/.exec(l))
      .filter((x): x is RegExpExecArray => x !== null)
      .map((x) => [x[1]!, x[2]!]),
  );
}

const FORBIDDEN =
  /^(Bash|Edit|Write|MultiEdit|NotebookEdit|WebFetch|WebSearch|Read|Grep|Glob|Task|Agent)\b/;

describe('crawler subagent lockdown', () => {
  const fm = frontmatter(repoFile('.claude/agents/crawler.md'));

  it('declares a tools allowlist (omitting it would inherit every tool)', () => {
    expect(typeof fm.tools).toBe('string');
    expect((fm.tools as string).trim()).not.toBe('');
  });

  it('lists exactly the agent-facing pathfinder tools of contracts/mcp-tools.md', () => {
    const tools = (fm.tools as string).split(',').map((t) => t.trim());
    expect(tools.sort()).toEqual(AGENT_TOOL_NAMES.map((n) => `mcp__pathfinder__${n}`).sort());
  });

  it('has no shell, file, web, other-MCP or wildcard tool', () => {
    for (const t of (fm.tools as string).split(',').map((s) => s.trim())) {
      expect(t).not.toMatch(FORBIDDEN);
      expect(t.startsWith('mcp__pathfinder__')).toBe(true);
      expect(t).not.toContain('*');
    }
    expect(fm).not.toHaveProperty('disallowedTools');
  });

  it("the server's registered tool list excludes every recording service and complete_run", async () => {
    const ctx = await makeCtx();
    const runtime = {
      openSession: async () => {},
      navigate: async () => ({}),
      act: async () => ({}),
      closeAll: async () => {},
    } as unknown as Runtime;
    const server = createServer(ctx, runtime);
    const client = new Client({ name: 't', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...AGENT_TOOL_NAMES].sort());
    expect(names.filter((n) => /^(record_|add_frontier_item|complete_run)/.test(n))).toEqual([]);
  });

  it('.mcp.json registers only the pathfinder server for the crawler to reach', () => {
    const mcp = JSON.parse(readFileSync(repoFile('.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { type?: string; command: string }>;
    };
    expect(Object.keys(mcp.mcpServers)).toContain('pathfinder');
    expect(mcp.mcpServers.pathfinder!.type ?? 'stdio').toBe('stdio');
    // no other server may hand the crawler a browser or network path
    expect(
      Object.keys(mcp.mcpServers).filter((n) => /playwright|browser|puppeteer|fetch|http/i.test(n)),
    ).toEqual([]);
  });
});
