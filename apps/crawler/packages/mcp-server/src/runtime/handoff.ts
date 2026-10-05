import { newId, nowIso } from '@pathfinder/core';
import { CAPTCHA_MARKERS } from '@pathfinder/safety';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';
import type { RunState } from './run-state.js';

type Page = RunState['session']['page'];

/** The hand-off question text (contracts/login-tool.md); one per state per run. */
export const handoffText = (routeTemplate: string): string =>
  `Human needed: CAPTCHA on ${routeTemplate}. The crawler does not solve CAPTCHAs.`;

/**
 * A CAPTCHA the page shows NOW, read from the rendered DOM and its frames. The request gate only
 * sees server responses, so a widget a single-page app renders after load was invisible to it
 * (spec 009 findings F-01). Returns the marker found, or null.
 */
export async function captchaInDom(page: Page): Promise<string | null> {
  for (const f of page.frames()) {
    const url = f.url().toLowerCase();
    const m = CAPTCHA_MARKERS.find((x) => url.includes(x));
    if (m) return m;
  }
  const html = (await page.content().catch(() => '')).toLowerCase();
  return CAPTCHA_MARKERS.find((x) => html.includes(x)) ?? null;
}

/**
 * Off production: record the state as needing a human (decision note + open question) and let the
 * crawl continue (FR-022). On production: the run stops with a warning, as for any block
 * (constitution Principle V). Returns true when a hand-off was recorded for this state.
 */
export async function handoffIfCaptcha(
  ctx: ServerContext,
  rs: RunState,
  stateId: string,
  routeTemplate: string,
  onProductionStop: (warning: string) => Promise<void>,
): Promise<boolean> {
  const marker = await captchaInDom(rs.session.page);
  if (marker === null) return false;
  if (rs.effective.portal.environment === 'production') {
    const warning = `CAPTCHA/bot challenge (${marker}) on ${routeTemplate}, stopping the run`;
    await onProductionStop(warning);
    throw new ToolError('RUN_STOPPED', warning);
  }
  if (rs.handoffs.has(stateId)) return true;
  rs.handoffs.add(stateId);
  await ctx.decisions.record({
    run_id: rs.runId,
    kind: 'note',
    rule: 'handoff:captcha',
    reason: `CAPTCHA (${marker}) on ${routeTemplate}: handed to a human, the crawl continues elsewhere`,
    subject_ref: stateId,
    detail: { kind: 'captcha', marker, route_template: routeTemplate },
  });
  await ctx.db
    .insertInto('open_questions')
    .values({
      id: newId(),
      run_id: rs.runId,
      text: handoffText(routeTemplate),
      about_ref: stateId,
      status: 'open',
      created_at: nowIso(),
    })
    .execute();
  ctx.tracer.event('handoff', { kind: 'captcha', state_id: stateId, marker });
  return true;
}
