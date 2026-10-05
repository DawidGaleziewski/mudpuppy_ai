import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SECRETS, type Logger } from '@pathfinder/core';
import { ToolError } from '../errors.js';

/** Success: the value as `structuredContent`, mirrored as JSON text (spec 001 result shape). */
export function ok(value: unknown): CallToolResult {
  // The agent never sees a registered credential, even one a portal echoes (spec 009 FR-019).
  const safe = SECRETS.redactJson(value);
  return {
    content: [{ type: 'text', text: JSON.stringify(safe) }],
    structuredContent: safe as Record<string, unknown>,
  };
}

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
