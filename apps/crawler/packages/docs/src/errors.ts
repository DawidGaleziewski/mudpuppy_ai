/** Refusals the documentation core can raise; callers (BA tools, operator commands) map them to their own error shape. */
export const DOCS_ERROR_CODES = [
  'SCHEMA_INVALID',
  'UNKNOWN_REF',
  'PORTAL_MISMATCH',
  'RUN_NOT_IN_SESSION',
  'STALE_REVISION',
  'RELATION_NOT_ALLOWED',
] as const;
export type DocsErrorCode = (typeof DOCS_ERROR_CODES)[number];

export class DocsError extends Error {
  constructor(
    readonly code: DocsErrorCode,
    message: string,
    /** Machine-readable fields, e.g. `{ latest_rev }` for STALE_REVISION. */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DocsError';
  }
}
