/**
 * Build signatures (spec 039 design § 5.2): which build of each scope served a page, from the
 * content-hashed asset names it loaded or a portal-declared marker. Pure.
 */
import { createHash } from 'node:crypto';

export interface AssetRef {
  url: string;
  kind: 'script' | 'stylesheet';
  /** `main` for the top document, else the frame's URL. */
  frame: string;
  /** `document`: named by the document (`<script src>`, `<link>`); `script`: loaded by a script (a bundle). */
  loadedBy: 'document' | 'script';
}

export interface BuildSignature {
  scope: string;
  signature: string;
  source: 'assets' | 'marker' | 'unknown';
  /** The asset paths the signature was built from, sorted. */
  assets: string[];
}

/** File names or queries that carry a content hash (`app.3e1a9c21.js`, `?v=…`, `?hash=…`). */
const HASHED_NAME = /[.\-_]([0-9a-f]{8,}|[A-Za-z0-9_-]{16,})\.(m?js|css)$/;
const HASH_QUERY = /[?&](v|hash)=[^&]+/;

export const isHashedAsset = (url: string): boolean => {
  try {
    const u = new URL(url);
    return HASHED_NAME.test(u.pathname) || HASH_QUERY.test(u.search);
  } catch {
    return false;
  }
};

const assetPath = (url: string): string => {
  const u = new URL(url);
  const q = HASH_QUERY.exec(u.search)?.[0] ?? '';
  return `${u.pathname}${q ? `?${q.slice(1)}` : ''}`;
};

/**
 * The scope an asset belongs to. Frames are their own scope (`frame:<host><path>`); a bundle a
 * script loaded belongs to the folder it was served from (`mfe:<folder>`, the micro-frontend's
 * remote entry and chunks); everything the top document names is `shell` (F-04@039).
 */
export function scopeOf(asset: AssetRef): string {
  if (asset.frame !== 'main') {
    try {
      const f = new URL(asset.frame);
      return `frame:${f.host}${f.pathname}`;
    } catch {
      return `frame:${asset.frame}`;
    }
  }
  if (asset.loadedBy === 'script') {
    const path = new URL(asset.url).pathname;
    const folder = path.slice(0, path.lastIndexOf('/')) || '/';
    return `mfe:${folder}`;
  }
  return 'shell';
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/**
 * Signatures per scope: sha256 of the sorted unique hashed asset paths. A scope with assets but
 * none hashed is `unknown`. `marker` (the portal hook's version header, meta tag or endpoint value)
 * replaces the shell's signature. With no assets at all, the shell is still reported, as `unknown`
 * unless a marker names it.
 */
export function buildSignatures(assets: readonly AssetRef[], marker?: string): BuildSignature[] {
  const byScope = new Map<string, Set<string>>();
  const seen = new Set<string>(['shell']);
  for (const a of assets) {
    const scope = scopeOf(a);
    seen.add(scope);
    if (!isHashedAsset(a.url)) continue;
    const set = byScope.get(scope) ?? new Set<string>();
    set.add(assetPath(a.url));
    byScope.set(scope, set);
  }
  return [...seen].sort().map((scope): BuildSignature => {
    if (scope === 'shell' && marker)
      return { scope, signature: `marker:${marker}`, source: 'marker', assets: [] };
    const paths = [...(byScope.get(scope) ?? [])].sort();
    if (paths.length === 0) return { scope, signature: 'unknown', source: 'unknown', assets: [] };
    return { scope, signature: sha(paths.join('\n')), source: 'assets', assets: paths };
  });
}
