import { newId, nowIso } from '@pathfinder/core';
import { CAPTCHA_MARKERS } from '@pathfinder/safety';
import type { ServerContext } from '../context.js';
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
 * Record the state as needing a human (decision note + open question) and let the crawl continue
 * (FR-022), on every environment (spec 021). Returns true when a hand-off was recorded for this
 * state.
 */
export async function handoffIfCaptcha(
  ctx: ServerContext,
  rs: RunState,
  stateId: string,
  routeTemplate: string,
): Promise<boolean> {
  const marker = await captchaInDom(rs.session.page);
  if (marker === null) return false;
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
