import type { MountWait, observePage } from '@pathfinder/crawler';
import { PageComposition } from '@pathfinder/core';

type Observed = Awaited<ReturnType<typeof observePage>>;

/** What the agent is told about the page's make-up (contract): read frames, mounts left empty. */
export function compositionHints(
  o: Observed,
  mounts: MountWait | null,
): { frames?: number; mounts_pending?: string[] } {
  const frames = o.frames.filter((f) => f.observed).length;
  const pending = mounts?.timedOut ? mounts.mounts.filter((m) => !m.filled) : [];
  return {
    ...(frames > 0 ? { frames } : {}),
    ...(pending.length > 0 ? { mounts_pending: pending.map((m) => m.selector) } : {}),
  };
}

/**
 * What the observed page is made of (spec 015 data model): its frames, the frames beyond the depth,
 * the micro-frontend mount points and loaders of the settle that preceded it (top document), and
 * the clickable counts. Pure.
 */
export function pageComposition(o: Observed, mounts: MountWait | null = null): PageComposition {
  return PageComposition.parse({
    frames: o.frames.map((f) => ({
      path: f.path,
      url: f.url,
      name: f.name,
      title: f.title,
      origin: f.origin,
      observed: f.observed,
      depth: f.depth,
    })),
    frames_skipped: o.framesSkipped,
    mounts: (mounts?.mounts ?? []).map((m) => ({
      selector: m.selector,
      frame: '',
      filled: m.filled,
      waited_ms: Math.round(mounts!.waitedMs),
      bundles: mounts!.bundles,
    })),
    loaders: mounts?.loaders ?? [],
    clickables: {
      found: o.clickables.found,
      issued: o.clickables.issued.length,
      capped: o.clickables.capped,
    },
  });
}
