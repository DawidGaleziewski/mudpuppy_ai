import { frameByPath, locateClickable } from '@mudpuppy/crawler';
import type { autofillBeforeSubmit } from './autofill.js';
import type { ActionRow } from './actions.js';

/** The Playwright locator of the element (mcp-server has no direct playwright dependency). */
export type Locator = Parameters<typeof autofillBeforeSubmit>[2];
export type Page = Parameters<typeof frameByPath>[0];

export type Found =
  | { locator: Locator; matches: number }
  | { locator: null; matches: number; outcome: 'absent' | 'ambiguous' };

/**
 * Find an issued action's element again: by role, name and position, or, for a role-less
 * clickable, by its DOM path or exact text (spec 015 R2). Used by `act` and by the replay back to a
 * form step (spec 032).
 */
export async function findAgain(page: Page, action: ActionRow): Promise<Found> {
  // An action inside a frame resolves in that frame (spec 015 R3); a frame that is gone means the
  // element is gone.
  const doc = action.json.frame !== undefined ? frameByPath(page, action.json.frame) : page;
  if (doc === null) return { locator: null, matches: 0, outcome: 'absent' };
  const path = action.json.locators.find((l) => l.kind === 'path')?.value;
  if (action.json.found_by !== undefined && path !== undefined)
    return locateClickable(doc, { path, name: action.accessible_name });
  const all = doc.getByRole(
    action.role as never,
    action.accessible_name ? { name: action.accessible_name, exact: true } : {},
  );
  const matches = await all.count();
  const locator = all.nth(action.json.nth);
  if ((await locator.count()) === 0) return { locator: null, matches, outcome: 'absent' };
  return { locator, matches };
}
