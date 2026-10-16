// Asset health (spec 030 FR-041, scar SC-12, field GC-13): a stylesheet, script or font that did not
// load (an HTTP error, or a request a proxy or the gate refused) leaves the page unstyled or half
// rendered, and its screenshot shows it. Track such failures per browser context so the page they
// belong to can carry a render warning; nobody should document a broken look as the design.

import type { BrowserContext, Request, Response } from 'playwright';

/** Resource types whose failure changes how the page looks or works. */
export const RENDER_ASSETS: ReadonlySet<string> = new Set(['stylesheet', 'script', 'font']);

export interface FailedAsset {
  url: string;
  resourceType: string;
  /** HTTP status, when the server answered. */
  status?: number;
  /** Browser error text (`net::ERR_…`), when there was no answer. */
  failure?: string;
}

export interface AssetHealth {
  /** Failures since the last drain, oldest first, each URL once. */
  drain(): FailedAsset[];
  dispose(): void;
}

export function trackAssetHealth(context: BrowserContext): AssetHealth {
  let failed = new Map<string, FailedAsset>();
  const onResponse = (r: Response): void => {
    const type = r.request().resourceType();
    if (RENDER_ASSETS.has(type) && r.status() >= 400)
      failed.set(r.url(), { url: r.url(), resourceType: type, status: r.status() });
  };
  const onFailed = (r: Request): void => {
    const type = r.resourceType();
    if (!RENDER_ASSETS.has(type)) return;
    const failure = r.failure()?.errorText ?? 'failed';
    // A load cancelled because the page moved on is not a broken asset.
    if (failure.includes('ERR_ABORTED') && !failure.includes('BLOCKED')) return;
    failed.set(r.url(), { url: r.url(), resourceType: type, failure });
  };
  context.on('response', onResponse);
  context.on('requestfailed', onFailed);
  return {
    drain() {
      const out = [...failed.values()];
      failed = new Map();
      return out;
    },
    dispose() {
      context.off('response', onResponse);
      context.off('requestfailed', onFailed);
    },
  };
}
