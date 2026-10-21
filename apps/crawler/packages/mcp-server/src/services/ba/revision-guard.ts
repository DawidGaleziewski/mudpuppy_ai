// Documentation that grows instead of being recreated (spec 034 R-70 (3), field findings F-17,
// F-18 of spec 030): the server, not the prompt, stops a revision that is poorer than the one it
// replaces. `change_note` is required on every revision already, so it cannot be the signal; a
// revision that drops evidence links or use-case flow steps must list them in `dropped` with a
// reason. A process record whose only cited screens are error pages is refused outright: an error
// page is never the process (spec 033 FR-016).

import type { BaContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import { sessionRunIds } from './common.js';
import { statesOfLink } from './run-groups.js';

export interface SentLink {
  target_kind: string;
  target_id: string;
}

export interface DroppedLink {
  target_kind: string;
  target_id: string;
  run_id: string | null;
}

/** What a revision says it leaves out on purpose. */
export interface DropNotice {
  reason: string;
  evidence?: SentLink[];
  steps?: number;
}

const linkKey = (l: SentLink) => `${l.target_kind}:${l.target_id}`;

/**
 * The previous revision's links this revision no longer has. Links to runs outside the session are
 * carried over by the server (`outsideSessionLinks`), so only the session's own runs and the
 * run-less links (`doc_record`, `review`) can be dropped.
 */
export function droppedLinks(
  ctx: BaContext,
  recordId: string,
  previousRev: number,
  sessionId: string,
  sent: readonly SentLink[],
): DroppedLink[] {
  const inSession = new Set(sessionRunIds(ctx, sessionId));
  const kept = new Set(sent.map(linkKey));
  const before = ctx.raw
    .prepare(
      `SELECT l.target_kind, l.target_id, l.run_id
       FROM doc_evidence l JOIN doc_revisions rev ON rev.id = l.revision_id
       WHERE rev.record_id = ? AND rev.rev_no = ? ORDER BY l.id`,
    )
    .all(recordId, previousRev) as DroppedLink[];
  const seen = new Set<string>();
  return before.filter((l) => {
    const key = linkKey(l);
    if (seen.has(key)) return false;
    seen.add(key);
    return (l.run_id === null || inSession.has(l.run_id)) && !kept.has(key);
  });
}

/** A stored revision's content, parsed (null when it is missing). */
export function revisionContent(ctx: BaContext, recordId: string, revNo: number): unknown {
  const row = ctx.raw
    .prepare('SELECT content_json FROM doc_revisions WHERE record_id = ? AND rev_no = ?')
    .get(recordId, revNo) as { content_json: string } | undefined;
  return row === undefined ? null : (JSON.parse(row.content_json) as unknown);
}

function flowLength(content: unknown): number {
  const flow = (content as { main_flow?: unknown } | null)?.main_flow;
  return Array.isArray(flow) ? flow.length : 0;
}

/** How many main-flow steps a use case loses (0 for other kinds or a longer flow). */
export function droppedSteps(previous: unknown, next: unknown): number {
  return Math.max(0, flowLength(previous) - flowLength(next));
}

/**
 * Refuses a revision that drops links or steps it does not list in `dropped`; returns the text to
 * add to the change note when it does list them, so the history says what went and why.
 */
export function checkDrops(
  links: readonly DroppedLink[],
  steps: number,
  notice: DropNotice | undefined,
): string | null {
  if (links.length === 0 && steps === 0) return null;
  const listed = new Set((notice?.evidence ?? []).map(linkKey));
  const unlisted = links.filter((l) => !listed.has(linkKey(l)));
  const stepsUnlisted = steps > 0 && (notice?.steps ?? 0) < steps;
  if (notice === undefined || unlisted.length > 0 || stepsUnlisted)
    throw new ToolError(
      'REVISION_DROPS',
      `this revision drops ${links.length} evidence link(s) and ${steps} flow step(s) of the previous revision; keep them, or list each in "dropped" with a reason (documentation grows, it is not rewritten from scratch)`,
      {
        dropped_evidence: unlisted.map(({ target_kind, target_id }) => ({
          target_kind,
          target_id,
        })),
        dropped_steps: stepsUnlisted ? steps : 0,
      },
    );
  const parts = [
    links.length > 0 ? `${links.length} evidence link(s)` : null,
    steps > 0 ? `${steps} flow step(s)` : null,
  ].filter((p): p is string => p !== null);
  return `Dropped ${parts.join(' and ')}: ${notice.reason}`;
}

const citedStates = (ctx: BaContext, links: readonly SentLink[]) => [
  ...new Set(links.flatMap((l) => statesOfLink(ctx, l))),
];

/** Refuses a process record whose cited screens are all error (technical) states. */
export function assertProcessNotOnlyErrors(
  ctx: BaContext,
  kind: string,
  links: readonly SentLink[],
): void {
  if (kind !== 'process') return;
  const states = citedStates(ctx, links);
  if (states.length === 0) return;
  const marks = states.map(() => '?').join(',');
  const kinds = ctx.raw
    .prepare(`SELECT state_kind AS k FROM states WHERE id IN (${marks})`)
    .all(...states) as { k: string }[];
  if (kinds.length > 0 && kinds.every((r) => r.k === 'technical'))
    throw new ToolError(
      'PROCESS_ONLY_ERRORS',
      'every screen this process cites is an error page; an error page is never the process. Cite the runs that walked the journey (open_process_update lists them) and keep the error page as an error branch',
      { states },
    );
}
