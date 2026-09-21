import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
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
  startRunRecord,
} from '../services/index.js';

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
  'add_open_question',
  'add_rule_candidate',
  'finish_run',
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

function ok(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function fail(e: unknown, ctx: ServerContext): CallToolResult {
  if (e instanceof ToolError) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(e.toJSON()) }],
      structuredContent: e.toJSON(),
    };
  }
  ctx.logger.error({ err: e }, 'unhandled tool error');
  const body = { error: { code: 'INTERNAL', message: 'internal error; see server log' } };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(body) }],
    structuredContent: body,
  };
}

export function registerTools(server: McpServer, ctx: ServerContext, runtime: Runtime): void {
  const tool = <S extends z.ZodRawShape>(
    name: AgentToolName,
    description: string,
    shape: S,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
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

  tool(
    'start_run',
    'Start (or resume with resume_run_id) a read-only mapping run. Validates config and the production guard before any browser opens.',
    { portal_id: z.string(), persona_id: z.string(), resume_run_id: z.string().optional() },
    async (args) => {
      const { output, run, approved } = await startRunRecord(ctx, args);
      await runtime.openSession(ctx, run, approved);
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
    'Navigate to a URL (checked against scope, denylist and the read-only ceiling). The server records what it observes.',
    { run_id: z.string(), url: z.string() },
    (a) => runtime.navigate(ctx, a),
  );
  tool(
    'act',
    'Perform an action_id the server issued for the current state. The server re-checks safety before executing.',
    { run_id: z.string(), action_id: z.string() },
    (a) => runtime.act(ctx, a),
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
    'Request completion; succeeds only when the frontier is empty or a budget is exhausted.',
    { run_id: z.string(), summary: z.string().optional() },
    async (a) => {
      const out = await finishRun(ctx, a);
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
