import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  Amendment,
  AmendmentKind,
  AmendmentStatus,
  AmendmentSupersededReason,
  AmendmentTargetKind,
  ChatConversation,
  ChatConversationStatus,
  ChatMessage,
  ChatMessageRole,
  ProcessScope,
  ProcessScopeSource,
  WorkflowStep,
  WorkflowStepName,
  WorkflowStepStatus,
} from '../src/index.js';

const SQL = readFileSync(
  fileURLToPath(
    new URL('../../../../../data/migrations/0008_chat_orchestrator.up.sql', import.meta.url),
  ),
  'utf-8',
);
const ts = '2026-01-01T00:00:00.000Z';

/** 0010 rebuilt `workflow_steps` with the `stopped` status (spec 011 F-04). */
const SQL_0010 = readFileSync(
  fileURLToPath(
    new URL('../../../../../data/migrations/0010_step_stopped.up.sql', import.meta.url),
  ),
  'utf-8',
);

/** The string list of `<column> IN (...)` inside one table of the migration. */
function inList(table: string, column: string, sql = SQL): string[] {
  const body = sql.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]+?)\\) STRICT`))?.[1];
  const m = body?.match(new RegExp(`\\b${column} IN \\(([^)]+)\\)`));
  if (!m) throw new Error(`no IN list for ${table}.${column}`);
  return m[1]!.split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
}

describe('chat orchestrator schemas (0008)', () => {
  it('Zod enums equal the CHECK lists in the migration', () => {
    expect(ChatConversationStatus.options).toEqual(inList('chat_conversations', 'status'));
    expect(ChatMessageRole.options).toEqual(inList('chat_messages', 'role'));
    expect(WorkflowStepName.options).toEqual(inList('workflow_steps', 'step'));
    expect(WorkflowStepStatus.options).toEqual(inList('workflow_steps_new', 'status', SQL_0010));
    expect(ProcessScopeSource.options).toEqual(inList('process_scopes', 'source'));
    expect(AmendmentTargetKind.options).toEqual(inList('amendments', 'target_kind'));
    expect(AmendmentKind.options).toEqual(inList('amendments', 'kind'));
    expect(AmendmentStatus.options).toEqual(inList('amendments', 'status'));
    expect(AmendmentSupersededReason.options).toEqual(inList('amendments', 'superseded_reason'));
  });

  it('parses valid rows and rejects bad ones', () => {
    const conv = {
      id: 'c1',
      portal_id: null,
      goal: 'g',
      acp_session_id: null,
      persona_draft: {},
      status: 'active',
      created_at: ts,
      updated_at: ts,
    };
    expect(ChatConversation.safeParse(conv).success).toBe(true);
    expect(ChatConversation.safeParse({ ...conv, status: 'open' }).success).toBe(false);
    const msg = {
      id: 'm1',
      conversation_id: 'c1',
      seq: 0,
      role: 'user',
      content: 'hi',
      tool_name: null,
      error_ref: null,
      created_at: ts,
    };
    expect(ChatMessage.safeParse(msg).success).toBe(true);
    expect(ChatMessage.safeParse({ ...msg, seq: -1 }).success).toBe(false);
    const step = {
      id: 's1',
      conversation_id: 'c1',
      portal_id: 'p',
      step: 'map',
      status: 'todo',
      run_id: null,
      session_id: null,
      error_ref: null,
      started_at: null,
      finished_at: null,
      updated_at: ts,
    };
    expect(WorkflowStep.safeParse(step).success).toBe(true);
    expect(WorkflowStep.safeParse({ ...step, step: 'crawl' }).success).toBe(false);
    const scope = {
      id: 'sc1',
      conversation_id: 'c1',
      portal_id: 'p',
      process_name: 'Quote',
      persona: 'guest',
      start_state_id: 'a',
      end_state_id: 'b',
      selected_state_ids: ['a', 'b'],
      comments: { a: 'x' },
      source: 'agent_proposal',
      created_at: ts,
    };
    expect(ProcessScope.safeParse(scope).success).toBe(true);
    expect(ProcessScope.safeParse({ ...scope, comments: [] }).success).toBe(false);
  });

  it('enforces the amendment status invariants like the table CHECKs', () => {
    const amd = {
      id: 'a1',
      key: 'AMD-001',
      portal_id: 'p',
      scope_id: null,
      target_kind: 'state',
      target_id: 's1',
      kind: 'note',
      text: 'n',
      attachment_sha256: null,
      attachment_name: null,
      author: 'ba',
      status: 'active',
      anchor_fingerprint: null,
      anchor_route_template: null,
      anchor_element: null,
      superseded_by_run: null,
      superseded_reason: null,
      superseded_detail: null,
      superseded_at: null,
      dismissed_at: null,
      reapplied_as: null,
      reapplies: null,
      created_at: ts,
      withdrawn_at: null,
    };
    expect(Amendment.safeParse(amd).success).toBe(true);
    expect(Amendment.safeParse({ ...amd, text: null }).success).toBe(false);
    expect(Amendment.safeParse({ ...amd, status: 'superseded' }).success).toBe(false);
    expect(
      Amendment.safeParse({
        ...amd,
        status: 'superseded',
        superseded_at: ts,
        superseded_reason: 'element_removed',
      }).success,
    ).toBe(true);
    expect(Amendment.safeParse({ ...amd, status: 'dismissed' }).success).toBe(false);
    expect(Amendment.safeParse({ ...amd, status: 'withdrawn' }).success).toBe(false);
    expect(Amendment.safeParse({ ...amd, kind: 'attachment', text: null }).success).toBe(false);
    expect(Amendment.safeParse({ ...amd, key: 'AMD-1' }).success).toBe(false);
  });
});
