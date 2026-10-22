import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SECRETS, type Logger } from '@mudpuppy/core';
import { ToolError } from '../errors.js';

/**
 * Success: the value as `structuredContent`, mirrored as JSON text (spec 001 result shape). An
 * object result carries the server's `environment`, so which store a call hit is never a guess
 * (spec 030 FR-052; in the field MCP servers ran on another environment than the dashboard, GC-22).
 */
export function ok(value: unknown, environment?: string): CallToolResult {
  const withEnv =
    environment !== undefined && isPlainObject(value) ? { ...value, environment } : value;
  // The agent never sees a registered credential, even one a portal echoes (spec 009 FR-019).
  const safe = SECRETS.redactJson(withEnv);
  return {
    content: [{ type: 'text', text: JSON.stringify(safe) }],
    structuredContent: safe as Record<string, unknown>,
  };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !('environment' in v);

/** Failure: `{ error: { code, message, ...details } }`; anything that is not a ToolError is logged and hidden. */
export function fail(e: unknown, ctx: { logger: Logger }): CallToolResult {
  if (e instanceof ToolError) {
    const body = SECRETS.redactJson(e.toJSON());
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(body) }],
      structuredContent: body,
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
