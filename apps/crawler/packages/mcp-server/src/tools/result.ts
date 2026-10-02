import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from '@pathfinder/core';
import { ToolError } from '../errors.js';

/** Success: the value as `structuredContent`, mirrored as JSON text (spec 001 result shape). */
export function ok(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

/** Failure: `{ error: { code, message, ...details } }`; anything that is not a ToolError is logged and hidden. */
export function fail(e: unknown, ctx: { logger: Logger }): CallToolResult {
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
