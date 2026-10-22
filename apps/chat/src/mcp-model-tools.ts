// The portal model in the chat (spec 039 design § 12, T077): the process proposals to name,
// rebuilding the model, and the probe work waiting for the headless driver. A check run drives a
// browser and spends a replay budget, so the assistant starts one only after the owner says yes
// (owner answer 19, 2026-10-21). What changed and why (deviations and hypotheses) the orchestrator
// reads through the BA server's tools.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type OpenedDb,
  pendingErrorReplays,
  pendingReplays,
  reconcilePortalModel,
  unexploredProcesses,
} from '@mudpuppy/store';
import { z } from 'zod';
import { runningCheckRun, startCheckRun, type CheckRunDeps } from './check-runs.js';
import { HttpError } from './http-error.js';

type RawDb = OpenedDb['raw'];
type Ok = (body: Record<string, unknown>) => CallToolResult;
type Refused = (code: string, message: string, details?: string[]) => CallToolResult;

/** A store refusal with its own code (an unknown hypothesis key), else an internal error. */
function refusal(refused: Refused, error: unknown): CallToolResult {
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && error instanceof Error) return refused(code, error.message);
  return refused('INTERNAL', 'internal error in mudpuppy-chat; the chat service logs it');
}

/** Open process proposals the model wrote (`pnpm model:propose`), for the assistant to name. */
function openProposals(raw: RawDb, portal: string) {
  return (
    raw
      .prepare(
        `SELECT id, name, why, steps FROM grouping_suggestions
         WHERE portal_id = ? AND status = 'open' ORDER BY created_at, id`,
      )
      .all(portal) as { id: string; name: string; why: string; steps: string }[]
  ).map((s) => {
    const steps = JSON.parse(s.steps) as { title?: string; route?: string }[];
    return {
      id: s.id,
      name: s.name,
      why: s.why,
      screens: steps.map((x) => `${x.title ?? ''} (${x.route ?? ''})`),
    };
  });
}

export function registerModelTools(
  server: McpServer,
  ctx: { raw: RawDb; checkRuns?: CheckRunDeps | null },
  ok: Ok,
  refused: Refused,
): void {
  server.registerTool(
    'list_process_proposals',
    {
      description:
        'The process proposals the portal model cut from the screens (open ones only): id, the working name, why the screens belong together, and the screens in walking order. Name each with name_proposal. Read only.',
      inputSchema: { portal: z.string() },
    },
    ({ portal }) => {
      try {
        return ok({ proposals: openProposals(ctx.raw, portal) });
      } catch (error) {
        return refusal(refused, error);
      }
    },
  );

  server.registerTool(
    'name_proposal',
    {
      description:
        "Give an open process proposal the name the business would use (the portal's own words, e.g. its menu entry) and one sentence why its screens are one process. The person still accepts, edits or dismisses it in Processes.",
      inputSchema: {
        portal: z.string(),
        proposal_id: z.string(),
        name: z.string().trim().min(1).max(120),
        why: z.string().trim().min(1).max(600),
      },
    },
    ({ portal, proposal_id, name, why }) => {
      try {
        const done = ctx.raw
          .prepare(
            `UPDATE grouping_suggestions SET name = ?, why = ?
             WHERE id = ? AND portal_id = ? AND status = 'open'`,
          )
          .run(name, why, proposal_id, portal);
        if (done.changes !== 1)
          return refused('NOT_FOUND', `${proposal_id} is not an open proposal of ${portal}`);
        return ok({ proposal: { id: proposal_id, name } });
      } catch (error) {
        return refusal(refused, error);
      }
    },
  );

  server.registerTool(
    'reconcile_model',
    {
      description:
        'Rebuild the portal model from every recorded scan now (no browser, a few seconds). Each finished scan does it already; use it after people decided hypotheses or labelled pairs. Returns the new model version, or none when nothing changed.',
      inputSchema: { portal: z.string() },
    },
    ({ portal }) => {
      try {
        const r = reconcilePortalModel(ctx.raw, portal);
        return ok({ model_version: r.seq, changed: r.modelVersion !== null, stats: r.stats });
      } catch (error) {
        return refusal(refused, error);
      }
    },
  );

  server.registerTool(
    'model_actions',
    {
      description:
        'Probe work waiting for the headless driver: error replays (rule R1), boundary and regression tests of rules, and processes not explored yet. These drive a browser and spend a replay budget: ask the owner, and start them with start_check_run only after the owner says yes in this chat. Never claim they ran. Read only.',
      inputSchema: { portal: z.string() },
    },
    ({ portal }) => {
      try {
        const errors = pendingErrorReplays(ctx.raw, portal, { limit: 100 }).length;
        const tests = pendingReplays(ctx.raw, portal, { limit: 100 }).length;
        const unexplored = unexploredProcesses(ctx.raw, portal);
        return ok({
          error_replays: errors,
          rule_tests: tests,
          unexplored_processes: unexplored,
          check_runs: [
            ...(errors + tests > 0 ? ['replay'] : []),
            ...(unexplored.length > 0 ? ['explore'] : []),
          ],
          running: ctx.checkRuns ? runningCheckRun(ctx.checkRuns, portal) : null,
        });
      } catch (error) {
        return refusal(refused, error);
      }
    },
  );

  const checkRuns = ctx.checkRuns;
  if (!checkRuns) return;
  server.registerTool(
    'start_check_run',
    {
      description:
        'Start a check run on the headless driver in the background (no LLM): `replay` runs the error replays and the rule tests model_actions counts, `explore` explores unexplored processes (or the one process_key). Only after the owner said yes to exactly this in the chat, and say so in `confirmed_by`. One check run per portal at a time; the result comes into the model on its next rebuild.',
      inputSchema: {
        portal: z.string(),
        kind: z.enum(['replay', 'explore']),
        process_key: z.string().optional(),
        /** The owner's name or words that confirmed it ("the owner said: yes, run it"). */
        confirmed_by: z.string().trim().min(1).max(200),
      },
    },
    ({ portal, kind, process_key, confirmed_by }) => {
      try {
        const run = startCheckRun(checkRuns, portal, {
          kind,
          ...(process_key === undefined ? {} : { process_key }),
          author: `assistant (confirmed: ${confirmed_by})`,
        });
        return ok({ started: { id: run.id, kind: run.kind, command: run.command.join(' ') } });
      } catch (error) {
        if (error instanceof HttpError) {
          const codes: Record<number, string> = { 409: 'CHECK_RUN_BUSY', 404: 'NOT_FOUND' };
          return refused(codes[error.status] ?? 'INVALID', error.message);
        }
        return refusal(refused, error);
      }
    },
  );
}
