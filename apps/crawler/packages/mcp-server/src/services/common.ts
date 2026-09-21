import { Confidence, isEvidenceRef, type RunsTable, type Selectable } from '@pathfinder/core';
import { ToolError } from '../errors.js';
import type { ServerContext } from '../context.js';

export type RunRow = Selectable<RunsTable>;

export async function getRun(ctx: ServerContext, runId: string): Promise<RunRow> {
  const run = await ctx.db
    .selectFrom('runs')
    .selectAll()
    .where('id', '=', runId)
    .executeTakeFirst();
  if (!run) throw new ToolError('RUN_NOT_FOUND', `run ${runId} does not exist`);
  return run;
}

/** Run-stopped guard for every browser-touching or writing tool (FR-008, SC-007). */
export async function assertRunActive(ctx: ServerContext, runId: string): Promise<RunRow> {
  const run = await getRun(ctx, runId);
  if (run.status !== 'running') {
    throw new ToolError(
      'RUN_STOPPED',
      `run ${runId} is ${run.status}${run.warning ? `: ${run.warning}` : ''}; no further actions are possible`,
    );
  }
  return run;
}

/**
 * Principle II gate, applied before schema validation so the caller gets the specific code:
 * a missing/empty `evidence_ref` is MISSING_EVIDENCE, an unknown `confidence` is INVALID_CONFIDENCE.
 */
export function requireEvidenceAndConfidence(input: unknown): void {
  const rec = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const ref = rec.evidence_ref;
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new ToolError(
      'MISSING_EVIDENCE',
      'evidence_ref is required and must be non-empty (Principle II)',
    );
  }
  if (!isEvidenceRef(ref)) {
    throw new ToolError(
      'SCHEMA_INVALID',
      `evidence_ref must be "<sha256>.<ext>", got ${JSON.stringify(ref)}`,
    );
  }
  if (!Confidence.safeParse(rec.confidence).success) {
    throw new ToolError(
      'INVALID_CONFIDENCE',
      `confidence must be one of ${Confidence.options.join(', ')}`,
    );
  }
}
