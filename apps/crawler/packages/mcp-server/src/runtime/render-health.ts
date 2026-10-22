// Render warnings (spec 030 FR-041, scar SC-12): a state whose stylesheets, scripts or fonts failed
// to load gets a decision note naming them, so its screenshot is never read as the portal's design
// (in the field a corporate proxy refused the CDN and pages were recorded unstyled, GC-13). Written
// beside the hook notes, after the state is recorded.

import { shapeUrl } from '@mudpuppy/trace';
import type { ServerContext } from '../context.js';
import type { RunState } from './run-state.js';

export async function noteFailedAssets(
  ctx: ServerContext,
  rs: RunState,
  stateId: string,
): Promise<void> {
  const failed = rs.assets?.drain() ?? [];
  if (failed.length === 0) return;
  const what = failed.map(
    (f) => `${f.resourceType} ${f.url} (${f.status ?? f.failure ?? 'failed'})`,
  );
  await ctx.decisions.record({
    run_id: rs.runId,
    kind: 'warning',
    rule: 'render:assets_failed',
    reason: `${String(failed.length)} asset(s) did not load, so the page may look or work differently than it should: ${what.join('; ').slice(0, 400)}`,
    subject_ref: stateId,
    detail: {
      state_id: stateId,
      failed: failed.map((f) => ({
        resource_type: f.resourceType,
        url: f.url,
        ...(f.status !== undefined ? { status: f.status } : {}),
        ...(f.failure !== undefined ? { failure: f.failure } : {}),
      })),
    },
  });
  ctx.tracer.event('render_warning', {
    state_id: stateId,
    failed: failed.map((f) => ({
      resource_type: f.resourceType,
      url: shapeUrl(f.url, (u) => rs.peekRouteTemplate(u)),
      ...(f.status !== undefined ? { status: f.status } : {}),
      ...(f.failure !== undefined ? { failure: f.failure } : {}),
    })),
  });
}
