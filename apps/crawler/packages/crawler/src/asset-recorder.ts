// Asset recorder (spec 039 design § 5.2): the scripts and stylesheets the current document and its
// frames loaded, and the build marker header of the document's response, so each observation can
// name the build of every scope it was served by. A new main-frame document starts a new list;
// same-document navigations (an SPA route change) keep it, since nothing is reloaded.

import type { BrowserContext, Page, Response } from 'playwright';

/** The resource types a build signature is made of. */
const BUILD_ASSETS: ReadonlySet<string> = new Set(['script', 'stylesheet']);

export interface LoadedAsset {
  url: string;
  kind: 'script' | 'stylesheet';
  /** `main` for the top document, else the frame's URL. */
  frame: string;
}

export interface AssetRecorder {
  /** Assets of the current document and its frames, each URL once, in load order. */
  current(): LoadedAsset[];
  /** The marker header's value on the current document's response, if the portal names one. */
  markerHeader(): string | null;
  dispose(): void;
}

export function recordAssets(
  context: BrowserContext,
  page: Page,
  opts: { markerHeader?: string } = {},
): AssetRecorder {
  let assets = new Map<string, LoadedAsset>();
  let marker: string | null = null;
  const header = opts.markerHeader?.toLowerCase();
  const onResponse = (r: Response): void => {
    const req = r.request();
    let frame: ReturnType<typeof req.frame>;
    try {
      frame = req.frame();
    } catch {
      // A pop-up's first request has no frame yet (spec 020): not an asset of any page we observe.
      return;
    }
    const isMain = frame === page.mainFrame();
    if (req.isNavigationRequest() && req.resourceType() === 'document' && isMain) {
      assets = new Map();
      marker = header ? (r.headers()[header] ?? null) : null;
      return;
    }
    const type = req.resourceType();
    if (!BUILD_ASSETS.has(type) || r.status() >= 400) return;
    if (!assets.has(r.url()))
      assets.set(r.url(), {
        url: r.url(),
        kind: type as LoadedAsset['kind'],
        frame: isMain ? 'main' : frame.url(),
      });
  };
  context.on('response', onResponse);
  return {
    current: () => [...assets.values()],
    markerHeader: () => marker,
    dispose: () => context.off('response', onResponse),
  };
}
