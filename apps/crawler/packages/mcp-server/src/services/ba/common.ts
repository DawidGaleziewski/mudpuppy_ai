import { maskText, type AnalysisSessionsTable, type Selectable } from '@pathfinder/core';
import { DocsError } from '@pathfinder/docs';
import type { BaContext } from '../../context.js';
import { ToolError } from '../../errors.js';

export type SessionRow = Selectable<AnalysisSessionsTable>;

/** A refusal from the pure documentation core, in the tool error shape. */
export function toToolError(e: unknown): unknown {
  return e instanceof DocsError ? new ToolError(e.code, e.message, e.details) : e;
}

/**
 * One synchronous transaction per write (better-sqlite3): either every row of the write lands or
 * none does, and nothing else can interleave.
 */
export function inTransaction<T>(ctx: BaContext, fn: () => T): T {
  try {
    return ctx.raw.transaction(fn)();
  } catch (e) {
    throw toToolError(e);
  }
}

export function sessionRunIds(ctx: BaContext, sessionId: string): string[] {
  return (
    ctx.raw
      .prepare('SELECT run_id FROM analysis_session_runs WHERE session_id = ? ORDER BY run_id')
      .all(sessionId) as { run_id: string }[]
  ).map((r) => r.run_id);
}

/** Every write needs a `running` session: unknown, completed and interrupted ones are refused. */
export function requireActiveSession(ctx: BaContext, sessionId: string): SessionRow {
  const session = ctx.raw.prepare('SELECT * FROM analysis_sessions WHERE id = ?').get(sessionId) as
    SessionRow | undefined;
  if (!session)
    throw new ToolError('SESSION_NOT_ACTIVE', `session ${sessionId} does not exist`, {
      session_id: sessionId,
    });
  if (session.status !== 'running')
    throw new ToolError(
      'SESSION_NOT_ACTIVE',
      session.status === 'interrupted'
        ? `session ${sessionId} is interrupted; resume it with start_session(resume_session_id)`
        : `session ${sessionId} is ${session.status}; start a new session`,
      { session_id: sessionId, status: session.status },
    );
  return session;
}

/**
 * Prose must not carry personal data: when the PII scrubber would change a string the write is refused
 * (contracts/ba-mcp-tools.md). `skip` exempts paths that hold server ids rather than prose.
 */
export function assertNoPii(
  value: unknown,
  path: string,
  skip: (path: string) => boolean = () => false,
): void {
  if (typeof value === 'string') {
    if (!skip(path) && maskText(value) !== value)
      throw new ToolError(
        'PII_SUSPECTED',
        `${path} looks like it contains personal data (an e-mail, phone number, name or token); describe it without the value. Ids belong in evidence links, not in prose`,
        { field: path },
      );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoPii(v, `${path}[${i}]`, skip));
    return;
  }
  if (value !== null && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) assertNoPii(v, `${path}.${k}`, skip);
}

/** `JSON.parse` for a TEXT column the schema guarantees to be valid JSON. */
export function json<T = unknown>(text: string): T {
  return JSON.parse(text) as T;
}
