import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PermissionQuery } from '../src/acp-client.js';
import {
  BA_READ_TOOLS,
  BA_WRITE_TOOLS,
  CHAT_TOOLS,
  CRAWLER_TOOLS,
  createFence,
} from '../src/fence.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fence = createFence({ repoRoot });

function q(partial: Partial<PermissionQuery> & { tool: string | null }): PermissionQuery {
  return {
    toolCallId: 'call-1',
    title: partial.tool ?? 'unknown',
    parentToolCallId: null,
    parentAgent: null,
    rawInput: {},
    ...partial,
  };
}

const inCrawler = { parentToolCallId: 'a1', parentAgent: 'crawler' };
const inBa = { parentToolCallId: 'a1', parentAgent: 'ba' };

/** Harness-change attempts (FR-008, SC: 10/10 refused). Each must be denied. */
const HARNESS_REQUESTS: [string, PermissionQuery][] = [
  ['edit an agent', q({ tool: 'Edit', rawInput: { file_path: '.claude/agents/crawler.md' } })],
  ['write a skill', q({ tool: 'Write', rawInput: { file_path: '.claude/skills/x/SKILL.md' } })],
  ['edit a rule file', q({ tool: 'Edit', rawInput: { file_path: 'CLAUDE.md' } })],
  ['change MCP config', q({ tool: 'Write', rawInput: { file_path: '.mcp.json' } })],
  [
    'edit safety code',
    q({ tool: 'MultiEdit', rawInput: { file_path: 'apps/crawler/packages/safety/src/guard.ts' } }),
  ],
  [
    'shell: sed a hook',
    q({ tool: 'Bash', rawInput: { command: 'sed -i s/x/y/ .claude/hooks/a.sh' } }),
  ],
  ['shell: git commit', q({ tool: 'Bash', rawInput: { command: 'git commit -am x' } })],
  ['edit a portal config', q({ tool: 'Write', rawInput: { file_path: 'portals/x/portal.yaml' } })],
  ['notebook edit', q({ tool: 'NotebookEdit' })],
  ['run a config skill', q({ tool: 'Skill', rawInput: { skill: 'update-config' } })],
  ['start a general agent', q({ tool: 'Agent', rawInput: { subagent_type: 'general-purpose' } })],
  ['crawler runs a shell', q({ tool: 'Bash', ...inCrawler, rawInput: { command: 'ls' } })],
  ['ba writes a file', q({ tool: 'Write', ...inBa, rawInput: { file_path: 'specs/x.md' } })],
  ['ba reads the vault key', q({ tool: 'Read', ...inBa, rawInput: { file_path: '.env' } })],
  [
    'ba escapes its folder',
    q({
      tool: 'Read',
      ...inBa,
      rawInput: { file_path: '.claude/skills/ba-practice/references/../../../agents/ba.md' },
    }),
  ],
  ['orchestrator writes records itself', q({ tool: 'mcp__mudpuppy-ba__create_record' })],
  ['orchestrator drives the browser', q({ tool: 'mcp__mudpuppy__act' })],
  ['crawler calls a BA write tool', q({ tool: 'mcp__mudpuppy-ba__create_record', ...inCrawler })],
  [
    'unknown subagent',
    q({ tool: 'mcp__mudpuppy__navigate', parentToolCallId: 'a9', parentAgent: 'po' }),
  ],
  ['unknown tool', q({ tool: null, title: 'mystery' })],
  ['fetch the web', q({ tool: 'WebFetch', rawInput: { url: 'https://example.invalid' } })],
];

describe('fence', () => {
  it.each(HARNESS_REQUESTS)('refuses: %s', (_name, query) => {
    const decision = fence(query);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/^(HARNESS_CHANGE_REFUSED|NOT_ALLOWED): /);
  });

  it('has at least 10 harness-change cases', () => {
    expect(HARNESS_REQUESTS.length).toBeGreaterThanOrEqual(10);
  });

  it('labels file and shell tools as harness changes', () => {
    expect(fence(q({ tool: 'Edit' })).reason).toMatch(/^HARNESS_CHANGE_REFUSED/);
    expect(fence(q({ tool: 'Bash', ...inCrawler })).reason).toMatch(/^HARNESS_CHANGE_REFUSED/);
  });

  it.each(CHAT_TOOLS)('allows the orchestrator tool %s', (tool) => {
    expect(fence(q({ tool })).allow).toBe(true);
  });

  it.each(BA_READ_TOOLS)('allows the read-only BA tool %s on the main thread', (tool) => {
    expect(fence(q({ tool })).allow).toBe(true);
  });

  it('allows starting the crawler and ba agents', () => {
    expect(fence(q({ tool: 'Agent', rawInput: { subagent_type: 'crawler' } })).allow).toBe(true);
    expect(fence(q({ tool: 'Agent', rawInput: { subagent_type: 'ba' } })).allow).toBe(true);
  });

  it.each(CRAWLER_TOOLS)('allows %s inside the crawler', (tool) => {
    expect(fence(q({ tool, ...inCrawler })).allow).toBe(true);
  });

  it.each([...BA_READ_TOOLS, ...BA_WRITE_TOOLS])('allows %s inside the ba agent', (tool) => {
    expect(fence(q({ tool, ...inBa })).allow).toBe(true);
  });

  it('allows the ba agent to read its method references', () => {
    const file = '.claude/skills/ba-practice/references/passes.md';
    expect(fence(q({ tool: 'Read', ...inBa, rawInput: { file_path: file } })).allow).toBe(true);
    expect(
      fence(q({ tool: 'Read', ...inBa, rawInput: { file_path: resolve(repoRoot, file) } })).allow,
    ).toBe(true);
  });

  it('crawler and ba tool lists match their agent definitions', () => {
    const toolsOf = (name: string): string[] => {
      const text = readFileSync(resolve(repoRoot, '.claude/agents', `${name}.md`), 'utf8');
      const line = /^tools:\s*(.+)$/m.exec(text)?.[1] ?? '';
      return line.split(',').map((t) => t.trim());
    };
    expect(toolsOf('crawler').sort()).toEqual([...CRAWLER_TOOLS].sort());
    expect(toolsOf('ba').sort()).toEqual([...BA_READ_TOOLS, ...BA_WRITE_TOOLS, 'Read'].sort());
  });
});
