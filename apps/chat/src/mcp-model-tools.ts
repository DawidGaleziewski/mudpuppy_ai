// The portal model in the chat (spec 039 design § 12, T077): the process proposals to name,
// rebuilding the model, and the probe work waiting for the headless driver, which the owner starts
// (it drives a browser and spends a replay budget). What changed and why (deviations and
// hypotheses) the orchestrator reads through the BA server's tools.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type OpenedDb,
  pendingErrorReplays,
  pendingReplays,
  reconcilePortalModel,
  unexploredProcesses,
} from '@pathfinder/store';
import { z } from 'zod';

type RawDb = OpenedDb['raw'];
type Ok = (body: Record<string, unknown>) => CallToolResult;
type Refused = (code: string, message: string, details?: string[]) => CallToolResult;

/** A store refusal with its own code (an unknown hypothesis key), else an internal error. */
function refusal(refused: Refused, error: unknown): CallToolResult {
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && error instanceof Error) return refused(code, error.message);
  return refused('INTERNAL', 'internal error in pathfinder-chat; the chat service logs it');
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
  ctx: { raw: RawDb },
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
        'Probe work waiting for the headless driver: error replays (rule R1), boundary and regression tests of rules, and processes not explored yet. These drive a browser and spend a replay budget, so the owner starts them: propose the command shown, never claim they ran. Read only.',
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
          commands: [
            ...(errors + tests > 0 ? [`pnpm --dir apps/crawler model:replay ${portal} --env <env>`] : []),
            ...(unexplored.length > 0 ? [`pnpm --dir apps/crawler model:explore ${portal} --env <env>`] : []),
          ],
        });
      } catch (error) {
        return refusal(refused, error);
      }
    },
  );
}
