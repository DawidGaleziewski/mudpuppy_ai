import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Confidence } from '@pathfinder/core';
import { describeRecordKinds } from '@pathfinder/docs';
import {
  AnalysisPass,
  DocKind,
  EvidenceTargetKind,
  RelationType,
  RevisionStatus,
} from '@pathfinder/docs-model';
import { z } from 'zod';
import type { BaContext } from '../context.js';
import { getAccessMatrix } from '../services/ba/access.js';
import { getPendingFeedback } from '../services/ba/feedback.js';
import {
  EvidenceReadKind,
  getEvidence,
  getProcess,
  getRecord,
  listProcesses,
  listRecords,
} from '../services/ba/reads.js';
import { RunEvidenceKind, getRunEvidence } from '../services/ba/run-evidence.js';
import { listRuns } from '../services/ba/runs.js';
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
 * an id (contracts/ba-mcp-tools.md).
 */
export const BA_TOOL_NAMES = [
  'list_runs',
  'get_run_evidence',
  'get_evidence',
  'list_records',
  'get_record',
  'list_processes',
  'get_process',
  'get_pending_feedback',
  'start_session',
  'record_pass',
  'finish_session',
  'create_record',
  'revise_record',
  'withdraw_record',
  'address_crawler_question',
  'get_access_matrix',
] as const;
export type BaToolName = (typeof BA_TOOL_NAMES)[number];

const oneOf = (values: readonly string[]): string => values.join(', ');

/**
 * Content shapes and relations, generated from the schemas the server checks against: the BA
 * guessed them and 40 % of its writes were refused (spec 015 F-20, spec 019 US4).
 */
const RECORD_KINDS = describeRecordKinds();

/**
 * Input shapes are deliberately loose (strings, not enums): the services validate strictly and answer
 * in the tool error shape (`SCHEMA_INVALID` naming the field), which the agent can act on.
 */
const evidenceItem = z.looseObject({
  target_kind: z.string().describe(`One of: ${oneOf(EvidenceTargetKind.options)}`),
  target_id: z
    .string()
    .describe(
      'Id from get_run_evidence / get_record; a doc_record may be given by its key; a screen_region gives the state id',
    ),
  run_id: z
    .string()
    .optional()
    .describe(
      'Only on a state or screen_region link: the run whose observation of the state you read. Never on other kinds; the server resolves their run',
    ),
  region: z
    .string()
    .optional()
    .describe(
      'Only on a screen_region link (required there): one element key of the state, copied verbatim from get_evidence elements, e.g. textbox "Pojemność silnika"',
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
        return ok(await handler(args), ctx.environment);
      } catch (e) {
        return fail(e, ctx);
      }
    }) as never);
  };

  // Reads
  tool(
    'list_runs',
    "Runs recorded for a portal, with status, how much each recorded and the persona's attributes (what decides that user's access, as the owner wrote them).",
    { portal_id: z.string() },
    (a) => listRuns(ctx, a),
  );
  tool(
    'get_access_matrix',
    "Which personas reached each screen, the variant (state) each saw, and the elements only some personas see: seen_by / not_seen_by, with depends_on_access marks and each persona's attributes. \"Not seen\" counts only completed map runs. Document an access rule with one persona that sees the element and one that does not as evidence: the element's screen_region on a seer's variant state and the non-seer's variant state. explained_by / reach_explained_by name the records that already do; an empty list is an unexplained difference the reviewer sees in Review. Pass screen_id for one screen.",
    { portal_id: z.string(), screen_id: z.string().optional() },
    (a) => getAccessMatrix(ctx, a),
  );
  tool(
    'get_run_evidence',
    'One page of what a run recorded, of one kind, with ids, confidence and a compact summary. Items omit null fields and fields equal to the page\'s `defaults` (e.g. confidence "observed", safety_class "read"): a missing field is null or the default. Pass next_cursor back as cursor for the next page, until it is null.',
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
    'The full recorded item and the content of its evidence file (ARIA snapshot or shape), cut at 60 kB with truncated: true. For a state also: screenshot (true when one was recorded), elements (key strings you can cite as a screen_region), and elements_without_box (keys that cannot be outlined on the screenshot, but are still valid to cite).',
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
    'list_processes',
    'Processes recorded by trace runs of a portal: id, run, name, goal, persona, outcome, step count and the boundary action when a trace stopped at its action limit.',
    { portal_id: z.string() },
    (a) => listProcesses(ctx, a),
  );
  tool(
    'get_process',
    'One process with its ordered steps (intent, kind, action, value, state before/after, network calls, outcomes, edge, evidence ref) and its boundary. Cite a process or step with target_kind process / process_step.',
    { process_id: z.string() },
    (a) => getProcess(ctx, a),
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
    `Create a documentation record. The server allocates the key and stores revision 1 as a draft; returns { key, rev_no }.\n${RECORD_KINDS}`,
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
    'Write a new draft revision of a record. base_rev must be its latest revision; content, evidence and relations replace the previous ones. Content shapes and relations: as in create_record.',
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
