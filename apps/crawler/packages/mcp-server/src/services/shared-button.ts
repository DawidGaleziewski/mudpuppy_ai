// A button of the shared navigation, the same on every page, is clicked once (spec 038, R-58 (3)).
// A link in the menu is settled by its target URL (same-target.ts); a button has none, and the
// same button on another page may do something else (F-12@031). Measured on the bank eval: the
// banner's "Wyloguj" was clicked from 14 states, and all 14 landed on the same start page. So a
// button in the banner, the navigation or the footer whose earlier clicks in this run all led to
// one other page is settled as an inferred move to that page, without an agent turn. When any
// click stayed on its page, or two clicks landed on different pages, nothing is inferred.

import type { ServerContext } from '../context.js';
import { settleInferred, type FrontierRow, type SeenEdge } from './same-target.js';

/** Landmarks a site repeats on every page (the container locator starts with one of them). */
const SHARED = /^(banner|navigation|contentinfo)( "[^"]*")? > /;

interface ButtonAction {
  role?: string;
  input?: string;
  form?: unknown;
  locators?: { kind?: string; value?: string }[];
}

/** The container path of a plain button in shared navigation, which names it the same on every page. */
export function sharedButtonKey(actionJson: string): string | null {
  let a: ButtonAction;
  try {
    a = JSON.parse(actionJson) as ButtonAction;
  } catch {
    return null;
  }
  if (a.role !== 'button' || a.input || a.form) return null;
  const container = a.locators?.find((l) => l.kind === 'container')?.value;
  return container !== undefined && SHARED.test(container) ? container : null;
}

/**
 * Settle a shared-navigation button item from this run's earlier clicks of the same button (same
 * container path) on other pages: all observed, all to one state, none staying where it was.
 * Returns false, changing nothing, otherwise.
 */
export async function inferSharedButton(ctx: ServerContext, row: FrontierRow): Promise<boolean> {
  if (!row.action_id) return false;
  const key = sharedButtonKey(row.action_json);
  if (key === null) return false;
  const clicks = (
    ctx.raw
      .prepare(
        `SELECT id, from_state, to_state, evidence_ref, stabilization, action_json FROM edges
         WHERE run_id = ? AND status = 'executed' AND confidence = 'observed'
           AND json_extract(action_json, '$.role') = 'button' AND from_state <> ?
         ORDER BY id`,
      )
      .all(row.run_id, row.state_id) as (SeenEdge & { from_state: string; action_json: string })[]
  ).filter((e) => sharedButtonKey(e.action_json) === key);
  const first = clicks[0];
  if (first === undefined || first.to_state === null) return false;
  const oneTarget = clicks.every(
    (e) => e.to_state === first.to_state && e.to_state !== e.from_state,
  );
  if (!oneTarget) return false;
  await settleInferred(ctx, row, first, `shared_button: ${first.id}`);
  return true;
}
