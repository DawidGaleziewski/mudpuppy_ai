import { newId, nowIso } from '@mudpuppy/core';
import { decide, type WrittenPopup } from '@mudpuppy/crawler';
import { shapeUrl } from '@mudpuppy/trace';
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
  const written = await rs.session.takeWritten();
  if (urls.length === 0 && written.length === 0) return;
  await step({ ctx, run }, 'enqueue_frontier', async () => {
    const kept = await keptWritten(ctx, action, written);
    if (rs.isTrace) return reported(undefined, [...kept, ...urls.map((url) => noted(action, url))]);
    const g = gateContext(rs, await usage(ctx, run, rs, 0, depth));
    const reports: Report[] = [...kept];
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

/**
 * A window a script wrote into has no address to visit (LO-27, spec 080 FR-011, D-4 option (b)):
 * its title and snapshot are kept as an evidence file with a decision note on the action, which
 * the BA can cite. It is not a state; the option of observing it as a screen stays on R-35.
 */
async function keptWritten(
  ctx: ServerContext,
  action: ActionRow,
  written: readonly WrittenPopup[],
): Promise<Report[]> {
  const out: Report[] = [];
  for (const w of written.filter((x) => x.title !== '' || x.snapshot !== '')) {
    const evidence_ref = await ctx.evidence.storeText(
      `# pop-up written by script (no URL)\n# title: ${w.title}\n${w.snapshot}\n`,
      'yaml',
    );
    out.push(
      decision({
        kind: 'note',
        rule: 'popup_written',
        reason:
          'the action opened a window a script wrote into (no URL); its text was kept as evidence and the window closed',
        // The evidence file is the subject: detail is scrubbed, and a sha256 reads as a token there.
        subject_ref: evidence_ref,
        detail: { title: w.title, action_role: action.role, action_name: action.accessible_name },
      }),
    );
  }
  return out;
}

const noted = (action: ActionRow, url: string): Report =>
  decision({
    kind: 'note',
    rule: 'popup_opened',
    reason: 'the action opened a pop-up window; it was closed and its URL noted',
    subject_ref: action.id,
    detail: { url: shapeUrl(url) },
  });
