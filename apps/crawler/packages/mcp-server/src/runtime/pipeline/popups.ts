import { newId, nowIso } from '@pathfinder/core';
import { decide } from '@pathfinder/crawler';
import { shapeUrl } from '@pathfinder/trace';
import type { ServerContext } from '../../context.js';
import type { RunRow } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import type { ActionRow } from './actions.js';
import { decision, event, reported, step, type Report } from './context.js';
import { gateContext, usage } from './gate.js';

/**
 * Pop-up windows an action opened (`target="_blank"`, `window.open`) are closed at once, and the
 * URL each one opened becomes a `navigate` item of the frontier, gated like `navigate`, one level
 * below the action's page: the run visits the pop-up's screen in its own tab (LO-27). A window a
 * script writes into has no URL and is not queued. A trace does not leave its page, so it only
 * notes the URL.
 */
export async function queueOpenedWindows(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  action: ActionRow,
  depth: number,
): Promise<void> {
  const urls = [...new Set(rs.session.takeOpened())];
  if (urls.length === 0) return;
  await step({ ctx, run }, 'enqueue_frontier', async () => {
    if (rs.isTrace)
      return reported(
        undefined,
        urls.map((url) => noted(action, url)),
      );
    const g = gateContext(rs, await usage(ctx, run, rs, 0, depth));
    const reports: Report[] = [];
    for (const url of urls) {
      const d = decide({ kind: 'navigate', url }, g);
      const id = newId();
      const ts = nowIso();
      const opened = `pop-up opened by action ${action.id}`;
      await ctx.db
        .insertInto('frontier')
        .values({
          id,
          run_id: run.id,
          state_id: action.state_id,
          action_id: null,
          // Exactly `{kind, url}`: `navigate` settles pending items by this JSON.
          action_json: JSON.stringify({ kind: 'navigate', url }),
          safety_class: d.classification.safetyClass,
          status: d.allowed ? 'pending' : d.status,
          priority: 1,
          depth,
          reason: d.allowed ? opened : `${d.rule}: ${d.reason} (${opened})`,
          created_at: ts,
          updated_at: ts,
        })
        .execute();
      const at = {
        frontier_id: id,
        action: { kind: 'navigate', url: shapeUrl(url) },
        depth,
        priority: 1,
      };
      reports.push(
        noted(action, url),
        d.allowed
          ? event('frontier_enqueue', { ...at, safety_class: d.classification.safetyClass })
          : event('frontier_skip', {
              ...at,
              safety_class: d.classification.safetyClass,
              rule: d.rule,
              reason: d.reason,
            }),
      );
    }
    return reported(undefined, reports);
  });
}

const noted = (action: ActionRow, url: string): Report =>
  decision({
    kind: 'note',
    rule: 'popup_opened',
    reason: 'the action opened a pop-up window; it was closed and its URL noted',
    subject_ref: action.id,
    detail: { url: shapeUrl(url) },
  });
