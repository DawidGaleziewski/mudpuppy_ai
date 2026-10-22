// Spec 043 (D-5, F-10, SC-004): the Workbench fence. The assistant reads and composes; it starts
// the crawler only with a prompt a confirmed command handed over, once; no write tool, ever.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PermissionQuery } from '../src/acp-client.js';
import { createWorkbenchFence, Launches } from '../src/workbench-session.js';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const CONV = 'conv-wb';

const q = (
  tool: string,
  rawInput: unknown = {},
  parent: string | null = null,
): PermissionQuery => ({
  toolCallId: `call-${tool}`,
  tool,
  title: tool,
  parentToolCallId: parent,
  parentAgent: parent === null ? null : 'crawler',
  rawInput,
});

describe('Workbench fence', () => {
  it('reads and composes, never writes', () => {
    const fence = createWorkbenchFence({ repoRoot }, CONV, new Launches());
    for (const tool of [
      'mcp__mudpuppy-chat__render_view',
      'mcp__mudpuppy-chat__propose_command',
      'mcp__mudpuppy-ba__list_records',
    ])
      expect(fence(q(tool)).allow, tool).toBe(true);
    for (const tool of [
      'mcp__mudpuppy-chat__request_scan',
      'mcp__mudpuppy-chat__stop_scan',
      'mcp__mudpuppy-ba__create_record',
      'Bash',
      'Write',
    ])
      expect(fence(q(tool)).allow, tool).toBe(false);
  });

  it('starts the crawler only with a confirmed command’s prompt, once', () => {
    const launches = new Launches();
    const fence = createWorkbenchFence({ repoRoot }, CONV, launches);
    const start = (prompt: string) => fence(q('Agent', { subagent_type: 'crawler', prompt }));
    expect(start('Map the whole portal.')).toMatchObject({ allow: false });
    launches.allow(CONV, 'Resume scan 01a110d5.\nKeep the queue.');
    expect(
      createWorkbenchFence(
        { repoRoot },
        'other-conv',
        launches,
      )(q('Agent', { subagent_type: 'crawler', prompt: 'Resume scan 01a110d5. Keep the queue.' }))
        .allow,
    ).toBe(false);
    expect(start('Resume scan 01a110d5.  Keep the queue. ').allow).toBe(true);
    expect(start('Resume scan 01a110d5. Keep the queue.').allow).toBe(false);
    expect(fence(q('Agent', { subagent_type: 'ba', prompt: 'x' })).allow).toBe(false);
  });

  it('the crawler’s own calls are judged by the chat’s fence', () => {
    const fence = createWorkbenchFence({ repoRoot }, CONV, new Launches());
    expect(fence(q('mcp__mudpuppy__navigate', {}, 'agent-1')).allow).toBe(true);
    expect(fence(q('Bash', {}, 'agent-1')).allow).toBe(false);
  });
});
