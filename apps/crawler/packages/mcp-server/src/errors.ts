import type { ZodType } from 'zod';

/** Error codes from contracts/mcp-tools.md, plus the ones the recording services add (see the contract). */
export const ERROR_CODES = [
  'ENV_GUARD_REFUSED',
  'CONFIG_INVALID',
  'PORTAL_NOT_FOUND',
  'RUN_NOT_FOUND',
  'RUN_NOT_RESUMABLE',
  'RUN_STOPPED',
  'ACTION_REFUSED',
  'UNKNOWN_ACTION',
  'UNKNOWN_REF',
  'FRONTIER_NOT_EMPTY',
  'MISSING_EVIDENCE',
  'INVALID_CONFIDENCE',
  'SCHEMA_INVALID',
  'UNSAFE_ACTION_EXECUTED',
  'SAFETY_CLASS_MISMATCH',
  'PII_SUSPECTED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class ToolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    /** Extra machine-readable fields, e.g. `{ rule }` for ACTION_REFUSED. */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ToolError';
  }

  toJSON(): { error: { code: ErrorCode; message: string } & Record<string, unknown> } {
    return { error: { code: this.code, message: this.message, ...this.details } };
  }
}

/** Validate `input` with a Zod schema; any problem is SCHEMA_INVALID naming the offending fields. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  throw new ToolError(
    'SCHEMA_INVALID',
    r.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; '),
  );
}
