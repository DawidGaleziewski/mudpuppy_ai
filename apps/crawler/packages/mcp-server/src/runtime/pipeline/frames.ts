import type { observePage } from '@mudpuppy/crawler';
import { shapeUrl } from '@mudpuppy/trace';
import { event, type Report } from './context.js';

type Observed = Awaited<ReturnType<typeof observePage>>;

/**
 * `event frame_skipped` per frame the observation did not read (spec 015 R3): a cross-origin frame
 * outside scope, one that failed to read, and the frames beyond the frame depth (one event with
 * the count). Read frames need no event: they are in the snapshot and the page composition.
 */
export function frameReports(o: Observed): Report[] {
  const out: Report[] = o.frames
    .filter((f) => !f.observed)
    .map((f) =>
      event('frame_skipped', {
        path: f.path,
        url: shapeUrl(f.url),
        reason: f.failed ? 'load_failed' : 'cross_origin',
      }),
    );
  if (o.framesSkipped > 0)
    out.push(event('frame_skipped', { count: o.framesSkipped, reason: 'depth' }));
  return out;
}
