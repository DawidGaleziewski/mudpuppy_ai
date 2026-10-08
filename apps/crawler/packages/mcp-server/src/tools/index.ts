import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { shapeUrl } from '@pathfinder/trace';
import type { CallStart, SpanHandle } from '@pathfinder/store';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';
import type { Runtime } from '../runtime.js';
import {
  addOpenQuestion,
  addRuleCandidate,
  finishRun,
  getKnownStates,
  getNextFrontierItem,
  interruptRun,
  startRunRecord,
} from '../services/index.js';
import { fail, ok } from './result.js';

/**
 * The ONLY tools the crawler subagent may use (as `mcp__pathfinder__<name>`). Recording services and
 * `complete_run` are deliberately absent: the agent proposes, the server observes and records.
 */
export const AGENT_TOOL_NAMES = [
  'start_run',
  'get_known_states',
  'get_next_frontier_item',
  'navigate',
  'act',
  'login',
  'add_open_question',
  'add_rule_candidate',
  'finish_run',
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** What the SDK passes a tool callback besides its arguments (RequestHandlerExtra, the part we read). */
interface ToolExtra {
  _meta?: Record<string, unknown>;
  requestId?: string | number;
}

export function registerTools(server: McpServer, ctx: ServerContext, runtime: Runtime): void {
  const tool = <S extends z.ZodRawShape>(
    name: AgentToolName,
    description: string,
    shape: S,
    handler: (args: z.infer<z.ZodObject<S>>, span: SpanHandle) => Promise<unknown>,
  ): void => {
    server.registerTool(name, { description, inputSchema: shape }, (async (
      args: z.infer<z.ZodObject<S>>,
      extra?: ToolExtra,
    ) => {
      // `rationale` is agent-stated context for the trace only; no service ever sees it.
      const { rationale, ...input } = args as z.infer<z.ZodObject<S>> & { rationale?: unknown };
      const { run_id: runId, url } = input as { run_id?: unknown; url?: unknown };
      const start: CallStart = {
        tool: name,
        runId: typeof runId === 'string' ? runId : null,
        // URLs are never stored raw in the trace (research §7).
        args: typeof url === 'string' ? { ...input, url: shapeUrl(url) } : input,
      };
      if (extra?._meta) start.meta = extra._meta;
      if (extra?.requestId !== undefined) start.requestId = extra.requestId;
      if (typeof rationale === 'string') start.rationale = rationale;
      try {
        const out = await ctx.tracer.call(start, async (span) => {
          const value = await handler(input as z.infer<z.ZodObject<S>>, span);
          span.setOutput(value);
          return value;
        });
        return ok(out);
      } catch (e) {
        return fail(e, ctx);
      }
    }) as never);
  };

  tool(
    'start_run',
    'Start (or resume with resume_run_id) a run: mode "map" (default) explores the portal; mode "trace" records one named process (process {name, goal}, optional followup_key of an open FUP). environment picks one of the portal\'s environments (required when it has several; a resumed run keeps its own). max_action_class lowers this run\'s limit (e.g. "read" = only look; never raises the portal\'s); skip_images answers image requests with an "Image skipped" placeholder; focus {start_url, only_domains, only_paths, exclude_paths} narrows the run to part of the portal (start there, stay on those hosts and path globs, never open the excluded ones; never widens) and base_url in the result is the page to start on; a resumed run keeps all three unless given again. Validates config and the environment guard before any browser opens.',
    {
      portal_id: z.string(),
      persona_id: z.string(),
      environment: z.enum(['production', 'staging', 'sandbox']).optional(),
      max_action_class: z
        .enum(['read', 'mutating', 'destructive', 'external-side-effect'])
        .optional(),
      skip_images: z.boolean().optional(),
      focus: z
        .object({
          start_url: z.string().optional(),
          only_domains: z.array(z.string()).optional(),
          only_paths: z.array(z.string()).optional(),
          exclude_paths: z.array(z.string()).optional(),
        })
        .optional(),
      resume_run_id: z.string().optional(),
      mode: z.enum(['map', 'trace']).optional(),
      process: z.object({ name: z.string(), goal: z.string() }).optional(),
      followup_key: z.string().optional(),
    },
    async (args, span) => {
      const { output, run, approved, robots } = await startRunRecord(ctx, args);
      span.setRunId(run.id);
      try {
        await runtime.openSession(ctx, run, approved, robots);
      } catch (err) {
        // The run row exists but no browser does: leave it resumable instead of stuck `running`.
        ctx.logger.error({ err, run_id: run.id }, 'browser session failed to launch');
        await interruptRun(ctx, run.id);
        throw new ToolError(
          'BROWSER_UNAVAILABLE',
          'the browser could not be launched; see server log (on Linux, missing system libraries: `playwright install-deps chromium`)',
          { run_id: run.id },
        );
      }
      return output;
    },
  );
  tool(
    'get_known_states',
    'List the states this run has already recorded.',
    { run_id: z.string(), cluster_id: z.string().optional() },
    (a) => getKnownStates(ctx, a),
  );
  tool(
    'get_next_frontier_item',
    'Next unexplored item chosen by the server, or null.',
    { run_id: z.string() },
    (a) => getNextFrontierItem(ctx, a),
  );
  tool(
    'navigate',
    "Navigate to a URL (checked against scope, denylist and the read-only ceiling). The server records what it observes. Trace runs require `intent` (the step's purpose).",
    {
      run_id: z.string(),
      url: z.string(),
      rationale: z.string().trim().min(1).max(300),
      intent: z.string().trim().min(1).max(200).optional(),
    },
    (a) => runtime.navigate(ctx, a),
  );
  tool(
    'act',
    'Perform an action_id the server issued for the current state. The server re-checks safety before executing. Trace runs require `intent`; fill/select actions take a synthetic `value`. TRACE_BOUNDARY_REACHED ends the run: stop and report.',
    {
      run_id: z.string(),
      action_id: z.string(),
      rationale: z.string().trim().min(1).max(300),
      intent: z.string().trim().min(1).max(200).optional(),
      value: z.string().max(500).optional(),
    },
    async (a) => {
      try {
        return await runtime.act(ctx, a);
      } catch (e) {
        // The boundary ended the run: release its browser like finish_run does.
        if (e instanceof ToolError && e.code === 'TRACE_BOUNDARY_REACHED')
          await runtime.closeRun?.(a.run_id);
        throw e;
      }
    },
  );
  tool(
    'login',
    "Log in as the run's persona. The server fills and submits the portal's login form with the persona's stored credentials (you never see them) and records the landing page. Returns outcome logged_in or failed (reason rejected | locked | captcha | control_not_found); after a failure no further login is possible in this run. Expired sessions are re-logged in automatically (results then carry relogged_in).",
    { run_id: z.string(), rationale: z.string().trim().min(1).max(300) },
    async (a) => {
      if (!runtime.login)
        throw new ToolError('LOGIN_NOT_CONFIGURED', 'this server runtime cannot log in');
      return runtime.login(ctx, a);
    },
  );
  tool(
    'add_open_question',
    'Record something unexplained about a state, edge or form (intent goes here, never in facts).',
    { run_id: z.string(), text: z.string(), about_ref: z.string() },
    (a) => addOpenQuestion(ctx, a),
  );
  tool(
    'add_rule_candidate',
    'Flag an inference about a state, edge or form. Stored as confidence "inferred" with the record\'s evidence.',
    { run_id: z.string(), text: z.string(), about_ref: z.string() },
    (a) => addRuleCandidate(ctx, a),
  );
  tool(
    'finish_run',
    'Request completion. Map runs: succeeds only when the frontier is empty or a budget is exhausted. Trace runs: pass outcome (goal_reached | abandoned) and a facts-only observed_result.',
    {
      run_id: z.string(),
      summary: z.string().optional(),
      outcome: z.enum(['goal_reached', 'abandoned']).optional(),
      observed_result: z.string().optional(),
      rationale: z.string().trim().min(1).max(300),
    },
    async (a) => {
      const out = await ctx.tracer.phase('complete_run', () =>
        finishRun(ctx, a, runtime.robotsStats?.(a.run_id)),
      );
      await runtime.closeRun?.(a.run_id);
      return out;
    },
  );
}

export function createServer(ctx: ServerContext, runtime: Runtime): McpServer {
  const server = new McpServer({ name: 'pathfinder', version: '0.0.0' });
  registerTools(server, ctx, runtime);
  return server;
}
