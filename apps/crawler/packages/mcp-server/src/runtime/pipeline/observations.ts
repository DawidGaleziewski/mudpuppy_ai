import { maskText, type NavigationHop, type ObservationVia } from '@mudpuppy/core';
import { parseUrlParams } from '@mudpuppy/fingerprint';
import { shownValues } from '@mudpuppy/model';
import { recordObservation, upsertBuilds } from '../../services/observations.js';
import { writeAttributes } from '../../services/journeys.js';
import { ensureJourney, nextObservationSeq } from './journey.js';
import type { RunState } from '../run-state.js';
import { markTransitHops } from '../transit.js';
import { audienceKey, contextKey, type PageCapture } from './capture-v2.js';
import { event, reported, step, type Report, type StepContext } from './context.js';

/** How this call reached its page, for the observation row. */
export function observationVia(sc: StepContext, relogged: boolean): ObservationVia {
  if (relogged) return 'relogin';
  if (sc.via.kind === 'act') return 'action';
  return sc.observationVia ?? 'navigate';
}

/** `event observation`: the URL's parameter count and the hop kinds, never the values (trace size). */
export function observationReports(
  url: string,
  hops: readonly NavigationHop[],
  via: ObservationVia,
): Report[] {
  return [
    event('observation', {
      via,
      params: parseUrlParams(url).length,
      hops: hops.map((h) => h.kind),
    }),
  ];
}

/**
 * Record the page's verbatim URL and the hops that led to it (spec 019, R-37/R-38). A portal with
 * `pii_scrub` gets its URLs masked like every other stored text; otherwise nothing is dropped.
 */
export function recordObservationStep(
  sc: StepContext,
  page: {
    stateId: string;
    url: string;
    transitionId: string | undefined;
    relogged: boolean;
    capture: PageCapture;
    /** The stored snapshot (masked only when the portal scrubs PII): shown values come from it. */
    snapshot: string;
  },
): Promise<string> {
  const { ctx, run, rs } = sc;
  return step(sc, 'record_observation', async () => {
    const scrub = rs.effective.portal.pii_scrub;
    const keep = (u: string) => (scrub ? maskText(u) : u);
    const drained = (await rs.session.navigation.drain()).map((h) => ({ ...h, url: keep(h.url) }));
    // A login's chain carries its transit pages (spec 037 FR-006); the zone ends with it.
    const hops = rs.transit === null ? drained : markTransitHops(drained, rs.transit);
    rs.transit = null;
    const url = keep(page.url);
    const via = observationVia(sc, page.relogged);
    const journeyId = await ensureJourney(ctx, rs);
    const buildIds = await upsertBuilds(ctx, run.portal_id, page.capture.builds);
    const declared = await experimentFlags(rs);
    // A probe run keeps every flag for rule R5; its context stays the declared arm (spec 046).
    const flags = rs.headless ? { ...(await allFlags(rs)), ...declared } : declared;
    const { observation_id } = await recordObservation(ctx, {
      run_id: run.id,
      state_id: page.stateId,
      transition_id: page.transitionId ?? null,
      via,
      url,
      hops,
      journey_id: journeyId,
      seq: await nextObservationSeq(ctx, rs),
      result: page.capture.result,
      context_key: contextKey(buildIds, audienceKey(rs), declared),
      flags,
      build_ids: buildIds,
      fingerprint_profile: rs.profile.id,
    });
    const at = rs.journey!.seq;
    if (!rs.journey!.reached.has(page.stateId)) rs.journey!.reached.set(page.stateId, at);
    rs.lastObservationId = observation_id;
    // What the page shows (label: value) is known from this step on (design § 5.8).
    await writeAttributes(
      ctx,
      journeyId,
      shownValues(page.snapshot).map((v) => ({
        seq: at,
        name: v.label,
        source: 'shown',
        raw: v.value,
      })),
    );
    return reported(observation_id, observationReports(url, hops, via));
  });
}

const FLAG_VALUE_MAX = 64;

/**
 * Every cookie and web storage key of the session (spec 046 FR-006): a probe run of the headless
 * driver records them all, so rule R5 can find the flag that separates two versions of a page
 * although nobody declared it. Values are cut to 64 characters.
 */
async function allFlags(rs: RunState): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of await rs.session.context.cookies().catch(() => []))
    out[`cookie:${c.name}`] = c.value.slice(0, FLAG_VALUE_MAX);
  const storage = await rs.session.page
    .evaluate(() => {
      const kv: [string, string][] = [];
      for (const s of [window.localStorage, window.sessionStorage])
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k !== null) kv.push([k, s.getItem(k) ?? '']);
        }
      return kv;
    })
    .catch(() => [] as [string, string][]);
  for (const [k, v] of storage) out[`storage:${k}`] = v.slice(0, FLAG_VALUE_MAX);
  return out;
}

/** The values of the portal's experiment flags in this session: cookies and web storage keys. */
async function experimentFlags(rs: RunState): Promise<Record<string, string>> {
  const wanted = rs.effective.portal.model.experiment_flags;
  if (wanted.length === 0) return {};
  const out: Record<string, string> = {};
  const cookies = await rs.session.context.cookies().catch(() => []);
  for (const f of wanted) {
    if ('cookie' in f) {
      const c = cookies.find((x) => x.name === f.cookie);
      if (c) out[`cookie:${f.cookie}`] = c.value;
      continue;
    }
    const v = await rs.session.page
      .evaluate(
        (k) => window.localStorage.getItem(k) ?? window.sessionStorage.getItem(k),
        f.storage,
      )
      .catch(() => null);
    if (v !== null) out[`storage:${f.storage}`] = v;
  }
  return out;
}
