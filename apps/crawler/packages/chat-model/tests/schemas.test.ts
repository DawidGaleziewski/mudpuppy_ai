import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  Amendment,
  AmendmentChange,
  AmendmentKind,
  AmendmentRevision,
  AmendmentStatus,
  AmendmentSupersededReason,
  AmendmentTargetKind,
  BaProcess,
  BaProcessChange,
  BaProcessRevision,
  BaProcessSource,
  BaProcessStage,
  ChangeSpecRevision,
  ChatConversation,
  ChatConversationKind,
  ChatConversationStatus,
  ChatMessage,
  ChatMessageRole,
  ChatProposal,
  ChatProposalStatus,
  GroupingSuggestion,
  GroupingSuggestionStatus,
  ProcessDraft,
  ProcessLive,
  ProcessLiveEnvironment,
  ProcessScope,
  ProcessScopeSource,
  ProcessStep,
  ProcessModel,
  ProcessModelChange,
  ProcessModelKind,
  ProcessModelRevision,
  WorkbenchCommand,
  WorkbenchCommandName,
  WorkbenchCommandSource,
  WorkbenchCommandState,
  WorkbenchFeedbackValue,
  WorkbenchPath,
  WorkbenchPathSource,
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
/** 0016 rebuilt `amendments` (status `needs_reanchor`) and added `amendment_revisions`. */
const SQL_0016 = readFileSync(
  fileURLToPath(
    new URL('../../../../../data/migrations/0016_amendment_revisions.up.sql', import.meta.url),
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
    expect(AmendmentStatus.options).toEqual(inList('amendments_new', 'status', SQL_0016));
    expect(AmendmentSupersededReason.options).toEqual(inList('amendments', 'superseded_reason'));
    expect(AmendmentStatus.options).toEqual(inList('amendment_revisions', 'status', SQL_0016));
    expect(AmendmentChange.options).toEqual(inList('amendment_revisions', 'change', SQL_0016));
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
      kind: 'chat',
    };
    expect(ChatConversation.safeParse(conv).success).toBe(true);
    expect(ChatConversation.safeParse({ ...conv, kind: 'other' }).success).toBe(false);
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
      rev: 1,
      screen_id: null,
    };
    expect(Amendment.safeParse(amd).success).toBe(true);
    expect(Amendment.safeParse({ ...amd, text: null }).success).toBe(false);
    expect(Amendment.safeParse({ ...amd, status: 'superseded' }).success).toBe(false); // 0016 renamed it
    expect(Amendment.safeParse({ ...amd, status: 'needs_reanchor' }).success).toBe(true);
    expect(Amendment.safeParse({ ...amd, rev: 0 }).success).toBe(false);
    expect(Amendment.safeParse({ ...amd, status: 'dismissed' }).success).toBe(false);
    expect(Amendment.safeParse({ ...amd, status: 'withdrawn' }).success).toBe(false);
    expect(Amendment.safeParse({ ...amd, kind: 'attachment', text: null }).success).toBe(false);
    expect(Amendment.safeParse({ ...amd, key: 'AMD-1' }).success).toBe(false);
  });
});

describe('amendment revisions (0016)', () => {
  const rev = {
    amendment_id: 'a1',
    rev: 1,
    base_rev: null,
    change: 'create',
    author: 'ba',
    status: 'active',
    target_kind: 'state',
    target_id: 's1',
    text: 'n',
    anchor_fingerprint: null,
    anchor_route_template: null,
    anchor_element: null,
    reason: null,
    run_id: null,
    created_at: ts,
  };

  it('parses r1 (no base) and a later revision (with base), like the table CHECK', () => {
    expect(AmendmentRevision.safeParse(rev).success).toBe(true);
    expect(
      AmendmentRevision.safeParse({ ...rev, rev: 2, base_rev: 1, change: 'edit' }).success,
    ).toBe(true);
    expect(AmendmentRevision.safeParse({ ...rev, base_rev: 1 }).success).toBe(false);
    expect(AmendmentRevision.safeParse({ ...rev, rev: 2 }).success).toBe(false);
    expect(AmendmentRevision.safeParse({ ...rev, change: 'supersede' }).success).toBe(false);
  });
});

describe('chat proposals (0017)', () => {
  const SQL_0017 = readFileSync(
    fileURLToPath(
      new URL('../../../../../data/migrations/0017_chat_proposals.up.sql', import.meta.url),
    ),
    'utf-8',
  );
  const base = {
    id: 'p1',
    conversation_id: 'c1',
    portal_id: 'portal',
    amendment_id: 'a1',
    base_rev: 1,
    payload: { text: 'x' },
    summary: 'Target: whole screen',
    status: 'open',
    applied_amendment_id: null,
    applied_rev: null,
    decided_by: null,
    decided_at: null,
    created_at: ts,
  };

  it('Zod enums equal the CHECK lists in the migration', () => {
    expect(ChatProposalStatus.options).toEqual(inList('chat_proposals', 'status', SQL_0017));
  });

  it('mirrors the row CHECKs', () => {
    expect(ChatProposal.safeParse(base).success).toBe(true);
    const created = { ...base, amendment_id: null, base_rev: null };
    expect(ChatProposal.safeParse(created).success).toBe(true);
    expect(ChatProposal.safeParse({ ...base, base_rev: null }).success).toBe(false);
    expect(ChatProposal.safeParse({ ...created, base_rev: 1 }).success).toBe(false);
    expect(ChatProposal.safeParse({ ...base, summary: '' }).success).toBe(false);
    expect(ChatProposal.safeParse({ ...base, status: 'applied', decided_at: ts }).success).toBe(
      false,
    );
    expect(
      ChatProposal.safeParse({
        ...base,
        status: 'applied',
        applied_amendment_id: 'a1',
        applied_rev: 2,
        decided_by: 'ba',
        decided_at: ts,
      }).success,
    ).toBe(true);
    expect(ChatProposal.safeParse({ ...base, status: 'stale' }).success).toBe(false);
    expect(ChatProposal.safeParse({ ...base, status: 'discarded', decided_at: ts }).success).toBe(
      true,
    );
  });
});

describe('BA processes (0018)', () => {
  const SQL_0018 = readFileSync(
    fileURLToPath(
      new URL('../../../../../data/migrations/0018_ba_processes.up.sql', import.meta.url),
    ),
    'utf-8',
  );
  const step = {
    id: 's1',
    title: 'Home',
    route: '/',
    state_id: 'st1',
    screen_id: null,
    observed: true,
    from: [],
    annotations: [],
  };

  it('Zod enums equal the CHECK lists in the migration', () => {
    expect(BaProcessStage.options).toEqual(inList('ba_processes', 'stage', SQL_0018));
    expect(BaProcessSource.options).toEqual(inList('ba_processes', 'source', SQL_0018));
    // 0028 rebuilt both revision tables with longer lists (spec 027): archive, unarchive, edit;
    // 0051 rebuilt them again (spec 078): scope, merge, unmerge.
    const SQL_0051 = readFileSync(
      fileURLToPath(
        new URL('../../../../../data/migrations/0051_process_scope_merge.up.sql', import.meta.url),
      ),
      'utf-8',
    );
    expect(BaProcessChange.options).toEqual(inList('ba_process_revisions_new', 'change', SQL_0051));
    expect(ProcessModelKind.options).toEqual(inList('process_variants', 'kind', SQL_0018));
    expect(ProcessModelChange.options).toEqual(
      inList('process_model_revisions_new', 'change', SQL_0051),
    );
    // process_live.environment is a free name since 0021 (spec 030 R-61): a format, not a list.
    for (const name of ['sandbox', 'dev', 'acceptance', 'live-2'])
      expect(ProcessLiveEnvironment.safeParse(name).success, name).toBe(true);
    for (const name of ['', 'Dev', 'has space', '9lives'])
      expect(ProcessLiveEnvironment.safeParse(name).success, name).toBe(false);
    expect(GroupingSuggestionStatus.options).toEqual(
      inList('grouping_suggestions', 'status', SQL_0018),
    );
  });

  it('mirrors the row CHECKs', () => {
    const rev = {
      model_id: 'v1',
      rev: 1,
      base_rev: null,
      change: 'create',
      author: 'BA',
      steps: [step],
      note: null,
      run_id: null,
      restored_from: null,
      created_at: ts,
    };
    expect(ProcessModelRevision.safeParse(rev).success).toBe(true);
    expect(ProcessModelRevision.safeParse({ ...rev, rev: 2 }).success).toBe(false);
    expect(ProcessModelRevision.safeParse({ ...rev, base_rev: 1 }).success).toBe(false);
    expect(ProcessModelRevision.safeParse({ ...rev, steps: {} }).success).toBe(false);
    expect(ProcessStep.safeParse({ ...step, from: ['s0'], annotations: [] }).success).toBe(true);
    expect(ProcessStep.safeParse({ ...step, observed: 'yes' }).success).toBe(false);

    const process = {
      id: 'p1',
      portal_id: 'portal',
      key: 'PRC-001',
      name: 'Claim',
      persona: 'anon',
      stage: 'scoped',
      rev: 1,
      source: 'scope',
      scope_id: null,
      suggestion_id: null,
      created_at: ts,
      updated_at: ts,
      archived_at: null,
      record_key: null,
    };
    expect(BaProcess.safeParse(process).success).toBe(true);
    expect(BaProcess.safeParse({ ...process, archived_at: ts }).success).toBe(true);
    expect(BaProcess.safeParse({ ...process, key: 'X-1' }).success).toBe(false);
    expect(
      BaProcessRevision.safeParse({
        process_id: 'p1',
        rev: 2,
        base_rev: 1,
        change: 'stage',
        author: 'BA',
        name: 'Claim',
        stage: 'migrating',
        as_is_rev: 3,
        created_at: ts,
      }).success,
    ).toBe(true);

    const model = {
      id: 'v1',
      process_id: 'p1',
      label: 'A',
      kind: 'as_is',
      rev: 1,
      branched_from_model_id: null,
      branched_from_rev: null,
      created_at: ts,
    };
    expect(ProcessModel.safeParse(model).success).toBe(true);
    expect(ProcessModel.safeParse({ ...model, branched_from_rev: 1 }).success).toBe(false);

    expect(
      ProcessDraft.safeParse({
        model_id: 'v1',
        author: 'BA',
        base_rev: 1,
        steps: [step],
        updated_at: ts,
      }).success,
    ).toBe(true);
    expect(
      ProcessLive.safeParse({
        id: 'l1',
        process_id: 'p1',
        environment: 'staging',
        model_id: 'v1',
        model_rev: 1,
        author: 'BA',
        reason: null,
        created_at: ts,
      }).success,
    ).toBe(true);

    const suggestion = {
      id: 'g1',
      portal_id: 'portal',
      name: 'Claim',
      persona: 'anon',
      steps: [step],
      why: 'Same flow',
      screens_key: 'a,b',
      status: 'open',
      conversation_id: null,
      process_id: null,
      decided_by: null,
      decided_at: null,
      created_at: ts,
    };
    expect(GroupingSuggestion.safeParse(suggestion).success).toBe(true);
    expect(GroupingSuggestion.safeParse({ ...suggestion, status: 'dismissed' }).success).toBe(
      false,
    );
    expect(
      GroupingSuggestion.safeParse({ ...suggestion, status: 'accepted', decided_at: ts }).success,
    ).toBe(false);

    const section = ['x'];
    const spec = {
      process_id: 'p1',
      rev: 1,
      base_rev: null,
      left_model_id: 'v1',
      left_rev: 1,
      right_model_id: 'v2',
      right_rev: 1,
      sections: {
        scope: 's',
        as_is: section,
        to_be: section,
        delta: section,
        records: section,
        migration_cut: section,
        open_questions: section,
      },
      author: 'BA',
      doc_key: null,
      created_at: ts,
    };
    expect(ChangeSpecRevision.safeParse(spec).success).toBe(true);
    expect(ChangeSpecRevision.safeParse({ ...spec, sections: [] }).success).toBe(false);
    expect(ChangeSpecRevision.safeParse({ ...spec, rev: 2 }).success).toBe(false);
  });
});

/** 0049 (spec 043): the Workbench tables. */
const SQL_0049 = readFileSync(
  fileURLToPath(new URL('../../../../../data/migrations/0049_workbench.up.sql', import.meta.url)),
  'utf-8',
);
const SQL_0050 = readFileSync(
  fileURLToPath(
    new URL('../../../../../data/migrations/0050_workbench_persona_add.up.sql', import.meta.url),
  ),
  'utf-8',
);

describe('Workbench schemas (0049)', () => {
  it('Zod enums equal the CHECK lists in the migration', () => {
    const kindList = SQL_0049.match(/ADD COLUMN kind TEXT[^(]*\(kind IN \(([^)]+)\)/)![1]!;
    expect(ChatConversationKind.options).toEqual(
      kindList.split(',').map((v) => v.trim().replace(/^'|'$/g, '')),
    );
    expect(WorkbenchPath.options).toEqual(inList('workbench_conversations', 'path', SQL_0049));
    expect(WorkbenchPath.options).toEqual(inList('workbench_views', 'path', SQL_0049));
    expect(WorkbenchPathSource.options).toEqual(
      inList('workbench_conversations', 'path_source', SQL_0049),
    );
    // 0050 rebuilt the table for persona.add (spec 072)
    expect(WorkbenchCommandName.options).toEqual(
      inList('workbench_commands_new', 'command', SQL_0050),
    );
    expect(WorkbenchCommandSource.options).toEqual(
      inList('workbench_commands', 'source', SQL_0049),
    );
    expect(WorkbenchCommandState.options).toEqual(inList('workbench_commands', 'state', SQL_0049));
    expect(WorkbenchFeedbackValue.options).toEqual(inList('workbench_feedback', 'value', SQL_0049));
  });

  it('a command past proposed needs its confirmation, done a result, failed an error', () => {
    const cmd = {
      id: 'k1',
      conversation_id: 'c1',
      turn: 1,
      command: 'scan.start',
      args_json: {},
      reason: 'r',
      source: 'button',
      state: 'proposed',
      token_hash: 'a'.repeat(64),
      precondition_hash: 'p',
      idempotency_key: 'i',
      expires_at: ts,
      confirmed_by: null,
      confirmed_at: null,
      result_json: null,
      error_ref: null,
      created_at: ts,
      updated_at: ts,
    };
    const confirmed = { confirmed_by: 'BA', confirmed_at: ts };
    expect(WorkbenchCommand.safeParse(cmd).success).toBe(true);
    expect(WorkbenchCommand.safeParse({ ...cmd, state: 'running' }).success).toBe(false);
    expect(WorkbenchCommand.safeParse({ ...cmd, ...confirmed, state: 'running' }).success).toBe(
      true,
    );
    expect(WorkbenchCommand.safeParse({ ...cmd, ...confirmed, state: 'done' }).success).toBe(false);
    expect(WorkbenchCommand.safeParse({ ...cmd, ...confirmed, state: 'failed' }).success).toBe(
      false,
    );
    expect(WorkbenchCommand.safeParse({ ...cmd, token_hash: 'short' }).success).toBe(false);
  });
});
