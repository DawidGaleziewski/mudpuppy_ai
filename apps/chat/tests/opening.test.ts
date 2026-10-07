import { describe, expect, it } from 'vitest';
import { workflowState, type WorkflowInput } from '@pathfinder/workflow';
import { openingMessage } from '../src/opening.js';
import { testService } from './helpers.js';

const base: WorkflowInput = {
  portal: 'reference-insurer',
  portalConfigured: true,
  personas: ['guest'],
  credentialsStored: true,
  runs: [],
  statesRecorded: 0,
  frontierPending: 0,
  processes: [],
  sessions: [],
  docRecords: 0,
  scopes: [],
  activeAmendments: 0,
  supersededAmendments: 0,
  recordedSteps: [],
};

describe('openingMessage', () => {
  it('without a portal asks which one and lists the configured portals', () => {
    const text = openingMessage(workflowState({ ...base, portal: null }), [
      'reference-insurer',
      'liveinsurer',
    ]);
    expect(text).toContain('`reference-insurer`, `liveinsurer`');
    expect(text).toContain('Which portal');
    expect(text).toContain('"+ new portal"'); // spec 011 FR-007
  });

  it('for a scanned portal proposes the valid next moves in order (FR-007)', () => {
    const text = openingMessage(
      workflowState({
        ...base,
        runs: [{ id: 'r', mode: 'map', status: 'completed', startedAt: 'a', endedAt: 'b' }],
        statesRecorded: 9,
      }),
      [],
    );
    expect(text).toContain('- scan: done (1 scan completed)');
    expect(text).toMatch(/1\. pick one process[\s\S]*2\. trace a process[\s\S]*3\. add amendments/);
    expect(text).not.toContain('produce the documentation');
  });

  it('says what a scan still needs when nothing can start', () => {
    const text = openingMessage(
      workflowState({ ...base, credentialsStored: false, personas: [] }),
      [],
    );
    expect(text).toContain('A scan needs: persona, test-user credentials.');
  });
});

describe('ChatService opening', () => {
  it('writes the opening message once, as the first message of a new conversation', async () => {
    const t = testService();
    const service = new (t.service.constructor as typeof import('../src/service.js').ChatService)({
      store: t.store,
      launch: t.launch,
      sessionRequest: () => ({ cwd: '/tmp/x', mcpServers: [] }),
      policy: () => ({ allow: true, reason: '' }),
      logError: () => Promise.resolve({ ref: 'ERR-X', logged: true }),
      opening: (portal) => `opening for ${portal ?? 'none'}`,
    });
    const { conversation } = await service.createConversation({ portal: 'liveinsurer' });
    await service.createConversation({ portal: 'liveinsurer' }); // resumes, no second opening
    const messages = await t.store.listMessages(conversation.id);
    expect(messages.map((m) => [m.role, m.content])).toEqual([['assistant', 'opening for liveinsurer']]);
    await t.opened.close();
  });
});
