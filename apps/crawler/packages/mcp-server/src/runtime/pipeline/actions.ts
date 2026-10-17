import { isSyntheticInput, type FoundBy } from '@pathfinder/core';
import type { ActionDescriptor } from '@pathfinder/safety';
import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import type { RunState } from '../run-state.js';

export interface ActionRow {
  id: string;
  state_id: string;
  role: string;
  accessible_name: string | null;
  json: {
    nth: number;
    /** Trace runs: a fill/check/select control. */
    input?: 'fill' | 'check' | 'select';
    href?: string;
    method?: string;
    form?: ActionDescriptor['form'];
    attributes?: Record<string, string>;
    locators: { kind: string; value: string; rank: number }[];
    snapshot_ref?: string;
    /** Signal-found actions only (spec 015); their role is `generic`. */
    found_by?: FoundBy[];
    /** Frame path; absent for the top document. */
    frame?: string;
    /** Element tag of a signal-found action, for the path locator. */
    tag?: string;
    page_url: string;
  };
}

/** The transition record carries the action's signals and locators but not where it was found. */
export function withoutPageUrl(json: ActionRow['json']): Omit<ActionRow['json'], 'page_url'> {
  const copy: Partial<ActionRow['json']> = { ...json };
  delete copy.page_url;
  return copy as Omit<ActionRow['json'], 'page_url'>;
}

export function descriptorOf(a: ActionRow): ActionDescriptor {
  return {
    role: a.role,
    ...(a.accessible_name ? { name: a.accessible_name } : {}),
    ...(a.json.href ? { href: a.json.href } : {}),
    ...(a.json.method ? { method: a.json.method } : {}),
    ...(a.json.form ? { form: a.json.form } : {}),
    ...(a.json.attributes ? { attributes: a.json.attributes } : {}),
    ...(a.json.input ? { input: a.json.input } : {}),
    ...(a.json.tag ? { tag: a.json.tag } : {}),
  };
}

export async function getAction(
  ctx: ServerContext,
  runId: string,
  actionId: string,
): Promise<ActionRow> {
  const row = await ctx.db
    .selectFrom('actions')
    .selectAll()
    .where('id', '=', actionId)
    .where('run_id', '=', runId)
    .executeTakeFirst();
  if (!row)
    throw new ToolError(
      'UNKNOWN_ACTION',
      `action_id ${actionId} was not issued by the server for this run`,
    );
  return {
    id: row.id,
    state_id: row.state_id,
    role: row.role,
    accessible_name: row.accessible_name,
    json: JSON.parse(row.action_json),
  };
}

/**
 * The value a fill/select step types or picks: the agent's, else the persona's `test_data` value
 * for the field's label. On a portal with `pii_scrub`, values must be synthetic
 * ({@link isSyntheticInput}): one the PII scrubber would change is refused, except an e-mail on a
 * reserved test TLD.
 */
export function inputValue(
  rs: RunState,
  action: ActionRow,
  value: string | undefined,
): string | null {
  const kind = action.json.input;
  if (kind !== 'fill' && kind !== 'select') {
    if (value !== undefined)
      throw new ToolError('SCHEMA_INVALID', 'value: only for fill and select actions');
    return null;
  }
  const v =
    value ??
    (action.accessible_name !== null
      ? rs.effective.persona.test_data[action.accessible_name]
      : undefined);
  if (v === undefined)
    throw new ToolError(
      'SCHEMA_INVALID',
      `value: required for ${kind} "${action.accessible_name ?? action.role}" (no test_data value for it)`,
    );
  // Since constitution 2.0.0 the check guards only portals that still scrub PII (`pii_scrub`).
  if (rs.effective.portal.pii_scrub && !isSyntheticInput(v))
    throw new ToolError(
      'PII_SUSPECTED',
      'value looks like personal data; use an obviously synthetic value (e-mail on .invalid, .test or .example)',
    );
  return v;
}
