import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  AnalysisPass,
  Confidence,
  DocKind,
  EvidenceTargetKind,
  RelationType,
  RevisionStatus,
} from '@pathfinder/core';
import { z } from 'zod';
import type { BaContext } from '../context.js';
import { getPendingFeedback } from '../services/ba/feedback.js';
import {
  EvidenceReadKind,
  RunEvidenceKind,
  getEvidence,
  getRecord,
  getRunEvidence,
  listRecords,
  listRuns,
} from '../services/ba/reads.js';
import {
  addressCrawlerQuestion,
  createRecord,
  reviseRecord,
  withdrawRecord,
} from '../services/ba/records.js';
import { finishSession, recordPass, startSession } from '../services/ba/sessions.js';
import { fail, ok } from '../tools/result.js';

/**
 * The ONLY tools the `ba` subagent may use (as `mcp__pathfinder-ba__<name>`): reads over recorded
 * evidence and Layer B writes. No browser, no crawler tool, and nothing that sets a status, a key or
 * an id (contracts/ba-mcp-tools.md). `list_processes` and `get_process` join with trace mode.
 */
export const BA_TOOL_NAMES = [
  'list_runs',
  'get_run_evidence',
  'get_evidence',
  'list_records',
  'get_record',
  'get_pending_feedback',
  'start_session',
  'record_pass',
  'finish_session',
  'create_record',
  'revise_record',
  'withdraw_record',
  'address_crawler_question',
] as const;
export type BaToolName = (typeof BA_TOOL_NAMES)[number];

const oneOf = (values: readonly string[]): string => values.join(', ');

/**
 * Input shapes are deliberately loose (strings, not enums): the services validate strictly and answer
 * in the tool error shape (`SCHEMA_INVALID` naming the field), which the agent can act on.
 */
const evidenceItem = z.looseObject({
  target_kind: z.string().describe(`One of: ${oneOf(EvidenceTargetKind.options)}`),
  target_id: z
    .string()
    .describe('Id from get_run_evidence / get_record; a doc_record may be given by its key'),
  run_id: z
    .string()
    .optional()
    .describe(
      'Only on a state link: the run whose observation of the state you read. Never on other kinds; the server resolves their run',
    ),
  note: z.string().optional().describe('What in the target supports the claim'),
});
const evidence = z
  .array(evidenceItem)
  .describe('At least one. Targets must come from the runs of the session');
const relations = z
  .array(
    z.looseObject({
      type: z.string().describe(`One of: ${oneOf(RelationType.options)}`),
      to_key: z.string().describe('Key of an existing record of this portal'),
    }),
  )
  .optional();
const content = z
  .record(z.string(), z.unknown())
  .describe('Fields of the record kind (title plus the kind-specific fields); no "kind" needed');
const confidence = z.string().describe(`One of: ${oneOf(Confidence.options)}`);
const notObservable = z
  .boolean()
  .optional()
  .describe('True for behaviour the evidence cannot show; needs a linked open question');

export function registerBaTools(server: McpServer, ctx: BaContext): void {
  const tool = <S extends z.ZodRawShape>(
    name: BaToolName,
    description: string,
    shape: S,
    handler: (args: z.infer<z.ZodObject<S>>) => unknown,
  ): void => {
    server.registerTool(name, { description, inputSchema: shape }, (async (
      args: z.infer<z.ZodObject<S>>,
    ) => {
      try {
        return ok(await handler(args));
      } catch (e) {
        return fail(e, ctx);
      }
    }) as never);
  };

  // Reads
  tool(
    'list_runs',
    'Runs recorded for a portal, with status and how much each recorded.',
    { portal_id: z.string() },
    (a) => listRuns(ctx, a),
  );
  tool(
    'get_run_evidence',
    'One page of what a run recorded, of one kind, with ids, confidence and a compact summary. Pass next_cursor back as cursor for the next page, until it is null.',
    {
      run_id: z.string(),
      kind: z.string().describe(`One of: ${oneOf(RunEvidenceKind.options)}`),
      cursor: z.string().optional(),
      limit: z
        .number()
        .optional()
        .describe('1–200, default 50. Leave unset: a larger page can exceed your output limit'),
    },
    (a) => getRunEvidence(ctx, a),
  );
  tool(
    'get_evidence',
    'The full recorded item and the content of its evidence file (masked ARIA snapshot or shape), cut at 60 kB with truncated: true.',
    {
      target_kind: z.string().describe(`One of: ${oneOf(EvidenceReadKind.options)}`),
      target_id: z.string(),
    },
    (a) => getEvidence(ctx, a),
  );
  tool(
    'list_records',
    'Documentation records of a portal: key, kind, title, latest and confirmed revision, and the status, confidence and not_observable flag of the latest revision.',
    {
      portal_id: z.string(),
      kind: z
        .string()
        .optional()
        .describe(`One of: ${oneOf(DocKind.options)}`),
      status: z
        .string()
        .optional()
        .describe(`Filter on the latest revision: ${oneOf(RevisionStatus.options)}`),
      include_withdrawn: z.boolean().optional(),
    },
    (a) => listRecords(ctx, a),
  );
  tool(
    'get_record',
    'One record with all its revisions (content, confidence, evidence links, relations, change note, status) and reviews.',
    { portal_id: z.string(), key: z.string() },
    (a) => getRecord(ctx, a),
  );
  tool(
    'get_pending_feedback',
    "Reviews (rejections, comments, confirmations) and follow-up tasks that changed since the portal's previous completed session. Answer rejections and comments first.",
    { portal_id: z.string() },
    (a) => getPendingFeedback(ctx, a),
  );

  // Session
  tool(
    'start_session',
    'Start an analysis session over runs of one portal, or resume an interrupted one with resume_session_id (may add runs). Evidence from other runs is refused.',
    {
      portal_id: z.string(),
      run_ids: z.array(z.string()).describe('At least one run of the portal'),
      resume_session_id: z.string().optional(),
    },
    (a) => startSession(ctx, a),
  );
  tool(
    'record_pass',
    'Record that one analysis pass is done, with a short summary.',
    {
      session_id: z.string(),
      pass: z.string().describe(`One of: ${oneOf(AnalysisPass.options)}`),
      summary: z.string(),
    },
    (a) => recordPass(ctx, a),
  );
  tool(
    'finish_session',
    'Complete the session with a summary and the gaps (what could not be documented and why). Refused until the synthesis pass is recorded.',
    { session_id: z.string(), summary: z.string(), gaps: z.array(z.string()) },
    (a) => finishSession(ctx, a),
  );

  // Writes
  tool(
    'create_record',
    'Create a documentation record. The server allocates the key and stores revision 1 as a draft; returns { key, rev_no }.',
    {
      session_id: z.string(),
      kind: z.string().describe(`One of: ${oneOf(DocKind.options)}`),
      content,
      confidence,
      not_observable: notObservable,
      evidence,
      relations,
    },
    (a) => createRecord(ctx, a),
  );
  tool(
    'revise_record',
    'Write a new draft revision of a record. base_rev must be its latest revision; content, evidence and relations replace the previous ones.',
    {
      session_id: z.string(),
      key: z.string().describe('Key of the record to revise'),
      base_rev: z.number().describe('The latest revision number you read'),
      content,
      confidence,
      not_observable: notObservable,
      evidence,
      relations,
      change_note: z.string().describe('What changed and why'),
      responds_to_review: z
        .string()
        .optional()
        .describe('review_id this revision answers (from get_pending_feedback)'),
    },
    (a) => reviseRecord(ctx, a),
  );
  tool(
    'withdraw_record',
    'Retire a record that is wrong or a duplicate. Its key is never reused.',
    {
      session_id: z.string(),
      key: z.string().describe('Key of the record to withdraw'),
      base_rev: z.number().describe('The latest revision number you read'),
      change_note: z.string().describe('Why it is withdrawn'),
      evidence,
    },
    (a) => withdrawRecord(ctx, a),
  );
  tool(
    'address_crawler_question',
    'Mark a crawler open question addressed by a record whose latest revision cites it as evidence (target_kind open_question).',
    { session_id: z.string(), open_question_id: z.string(), by_key: z.string() },
    (a) => addressCrawlerQuestion(ctx, a),
  );
}

export function createBaServer(ctx: BaContext): McpServer {
  const server = new McpServer({ name: 'pathfinder-ba', version: '0.0.0' });
  registerBaTools(server, ctx);
  return server;
}
