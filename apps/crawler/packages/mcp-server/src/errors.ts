import type { ZodType } from 'zod';

/** Error codes from contracts/mcp-tools.md, plus the ones the recording services add (see the contract). */
export const ERROR_CODES = [
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
  'ROBOTS_UNAVAILABLE',
  'BROWSER_UNAVAILABLE',
  // `navigate` could not open the page at all (spec 011 F-06).
  'NAVIGATION_FAILED',
  // Trace mode (specs/004-ba-documentation/contracts/crawler-trace-tools.md).
  'TRACE_BOUNDARY_REACHED',
  // BA server (specs/004-ba-documentation/contracts/ba-mcp-tools.md).
  'SESSION_NOT_ACTIVE',
  'SESSION_INCOMPLETE',
  'RUN_NOT_IN_SESSION',
  'PORTAL_MISMATCH',
  'RECORD_NOT_FOUND',
  'STALE_REVISION',
  'RELATION_NOT_ALLOWED',
  'NOT_OBSERVABLE_NEEDS_QUESTION',
  // Operator review command (shared with @mudpuppy/docs DocsErrorCode).
  'NOT_CANCELLABLE',
  // Server-side login (specs/009-legacy-proving-ground/contracts/login-tool.md).
  'LOGIN_NOT_CONFIGURED',
  'LOGIN_BLOCKED',
  'SESSION_LOST',
  // Form probes (specs/032-form-states-probes): the way back to a form step in the run failed.
  'REPLAY_DIVERGED',
  'NO_PATH',
  // Probing only when asked (spec 032 US5): a plain run, an unmarked step, a form-probing run without marks.
  'PROBE_NOT_ASKED',
  'STEP_NOT_MARKED',
  'NO_PROBE_MARKS',
  // Documentation that grows (spec 034 R-70): a revision that drops evidence or flow steps without
  // saying so; a process whose only cited screens are error pages; an unknown process to update.
  'REVISION_DROPS',
  'PROCESS_ONLY_ERRORS',
  'PROCESS_UNKNOWN',
  // Hypotheses (spec 039 design § 10, T055): no portal model yet; a claim without a test that
  // could refute it; a claim equal to a refuted one; an unknown hypothesis key.
  'NO_MODEL',
  'TEST_REQUIRED',
  'CLAIM_REFUTED',
  'UNKNOWN_HYPOTHESIS',
  // One process concept (spec 039 design § 13.4, T070): a process already has its PROC record.
  'PROCESS_DOCUMENTED',
  // API endpoints (spec 038 FR-008): an api_endpoint record that cites no captured call matching it.
  'API_CALL_NOT_CITED',
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
