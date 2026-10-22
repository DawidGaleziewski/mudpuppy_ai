import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFence } from '../src/fence.js';
import { testService } from './helpers.js';

/**
 * R-30 T029 (US4, FR-008, FR-020): harness-change requests go through the whole chat path
 * (service → ACP client → fence → agent) and are refused, nothing changes on disk, and safety-gate
 * refusals from the mudpuppy server reach the BA word for word.
 */
const repoRoot = resolve(import.meta.dirname, '../../..');
const GUARDED = [
  '.claude',
  'CLAUDE.md',
  '.mcp.json',
  'portals',
  'personas',
  'apps/crawler/packages/safety',
];
const scratch = mkdtempSync(join(tmpdir(), 'mudpuppy-fence-'));
let gitBefore: string;

function gitStatus(): string {
  return execFileSync('git', ['status', '--porcelain', '--', ...GUARDED], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

beforeAll(() => {
  gitBefore = gitStatus();
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

// Write targets point into a scratch copy of the layout: the fence judges the tool, and a broken
// fence must not be able to damage the real repo while this test proves it is not broken.
const at = (p: string): string => join(scratch, p);

const REQUESTS: [string, Record<string, unknown>][] = [
  ['edit the crawler agent', { tool: 'Write', rawInput: { file_path: at('crawler.md') } }],
  ['rewrite CLAUDE.md', { tool: 'Edit', rawInput: { file_path: at('CLAUDE.md') } }],
  [
    'change a hook with sed',
    { tool: 'Bash', rawInput: { command: 'sed -i s/a/b/ .claude/hooks/x.sh' } },
  ],
  ['add an MCP server', { tool: 'Write', rawInput: { file_path: at('mcp.json') } }],
  [
    'loosen the safety classifier',
    { tool: 'MultiEdit', rawInput: { file_path: at('classify.ts') } },
  ],
  ['widen a portal scope', { tool: 'Write', rawInput: { file_path: at('portal.yaml') } }],
  ['change settings via a skill', { tool: 'Skill', rawInput: { skill: 'update-config' } }],
  [
    'start an unrestricted agent',
    { tool: 'Agent', rawInput: { subagent_type: 'general-purpose' } },
  ],
  ['crawler runs a shell', { tool: 'Bash', agent: 'crawler', rawInput: { command: 'cat .env' } }],
  ['ba writes a file', { tool: 'Write', agent: 'ba', rawInput: { file_path: at('ba.md') } }],
  ['edit a notebook', { tool: 'NotebookEdit', rawInput: { notebook_path: at('n.ipynb') } }],
];

describe('fence acceptance through the chat service', () => {
  it(`refuses ${String(REQUESTS.length)}/${String(REQUESTS.length)} harness-change requests and changes nothing`, async () => {
    const t = testService(createFence({ repoRoot }));
    const { conversation } = await t.service.createConversation({ portal: 'reference-insurer' });
    for (const [name, spec] of REQUESTS) {
      await t.service.send(conversation.id, `call ${JSON.stringify(spec)}`);
      await t.service.drain(conversation.id);
      while (t.service.isBusy(conversation.id)) await new Promise((r) => setTimeout(r, 5));
      expect(t.log.permissionOutcomes.at(-1), name).toMatch(/:reject$/);
    }
    expect(t.log.permissionOutcomes).toHaveLength(REQUESTS.length);
    const refusals = (await t.store.listMessages(conversation.id)).filter(
      (m) => m.role === 'system' && m.content.startsWith('Refused:'),
    );
    expect(refusals).toHaveLength(REQUESTS.length);
    for (const file of [
      'crawler.md',
      'CLAUDE.md',
      'mcp.json',
      'classify.ts',
      'portal.yaml',
      'ba.md',
    ])
      expect(existsSync(at(file)), file).toBe(false);
    expect(gitStatus()).toBe(gitBefore);
    await t.opened.close();
  });

  it('lets the crawler reach the mudpuppy server and passes a gate refusal through unchanged', async () => {
    const t = testService(createFence({ repoRoot }));
    const { conversation } = await t.service.createConversation({ portal: 'reference-insurer' });
    const refusal =
      'ACTION_REFUSED: classified mutating, above the effective ceiling read; "Kup polisę" was not executed.';
    await t.service.send(
      conversation.id,
      `call ${JSON.stringify({ tool: 'mcp__mudpuppy__start_run', agent: 'crawler', say: refusal })}`,
    );
    await t.service.drain(conversation.id);
    while (t.service.isBusy(conversation.id)) await new Promise((r) => setTimeout(r, 5));
    expect(t.log.permissionOutcomes).toEqual(['mcp__mudpuppy__start_run:allow']);
    const last = (await t.store.listMessages(conversation.id)).at(-1);
    expect(last).toMatchObject({ role: 'assistant', content: refusal });
    await t.opened.close();
  });
});
