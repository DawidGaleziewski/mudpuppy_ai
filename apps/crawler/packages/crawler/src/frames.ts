import type { Frame, Page } from 'playwright';

/** A frame of the observed page (spec 015 R3): where it is, what it showed, whether it was read. */
export interface ObservedFrame {
  /** Child-index path from the top document: `"0"`, `"0/1"`; never empty for a frame. */
  path: string;
  url: string;
  name: string | null;
  title: string | null;
  origin: string;
  /** True when its content is in the observation (same origin as the page, or in scope). */
  observed: boolean;
  depth: number;
  /** The frame did not load (a browser error page, e.g. a blocked request) or could not be read. */
  failed?: true;
}

export interface WalkedFrame extends ObservedFrame {
  frame: Frame;
}

export interface FrameWalk {
  frames: WalkedFrame[];
  /** Frames deeper than the frame depth: counted, not read (spec edge case). */
  skipped: number;
}

export interface FrameWalkOptions {
  /** Deepest frame level read; 0 reads the top document only. */
  maxDepth: number;
  /** A frame on another origin is read only when the portal's scope admits its URL. */
  inScope: (url: string) => boolean;
}

/** `about:srcdoc` / `about:blank` frames belong to the document that holds them. */
function originOf(url: string, parent: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : parent;
  } catch {
    return parent;
  }
}

/**
 * Walk the page's frames in document order (iframes and `<frame>`s alike) down to `maxDepth`. A frame
 * is read when it is same-origin with the page or its URL is in scope; a cross-origin frame outside
 * scope (a payment or CAPTCHA widget) is recorded by URL only and never yields actions (FR-004).
 */
export async function walkFrames(page: Page, opts: FrameWalkOptions): Promise<FrameWalk> {
  const topOrigin = originOf(page.url(), '');
  const frames: WalkedFrame[] = [];
  let skipped = 0;
  const visit = async (parent: Frame, parentPath: string, parentOrigin: string, depth: number) => {
    for (const [i, frame] of parent.childFrames().entries()) {
      const path = parentPath === '' ? `${i}` : `${parentPath}/${i}`;
      if (depth > opts.maxDepth) {
        skipped += 1 + countFrames(frame);
        continue;
      }
      const url = frame.url();
      // A frame whose request was blocked (the CAPTCHA widget) shows Chromium's error page, which
      // would otherwise pass for a same-origin document: it is a failed frame, never read.
      const failed = url.startsWith('chrome-error:');
      const origin = failed ? 'null' : originOf(url, parentOrigin);
      const observed = !failed && (origin === topOrigin || opts.inScope(url));
      frames.push({
        path,
        url,
        name: frame.name() || null,
        title: failed ? null : await frameTitle(frame),
        origin,
        observed,
        depth,
        ...(failed ? { failed: true as const } : {}),
        frame,
      });
      if (observed) await visit(frame, path, origin, depth + 1);
    }
  };
  await visit(page.mainFrame(), '', topOrigin, 1);
  return { frames, skipped };
}

function countFrames(f: Frame): number {
  return f.childFrames().reduce((n, c) => n + 1 + countFrames(c), 0);
}

async function frameTitle(frame: Frame): Promise<string | null> {
  try {
    return (await frame.title()) || null;
  } catch {
    return null; // detached or still navigating: the URL is still recorded
  }
}

/** The label of a frame's block in the page snapshot: its name, else its path (never its URL). */
export function frameLabel(f: Pick<ObservedFrame, 'name' | 'path'>): string {
  return f.name ?? f.path;
}

/**
 * The page snapshot with each read frame's snapshot appended as an `- iframe "<label>":` block, in
 * frame order (pure, R3). The label is the frame's name or path, never its URL: a session id in a
 * frame URL must not split states. A page without frame content is returned unchanged, so its
 * fingerprint stays what it was before spec 015 (FR-005).
 */
export function withFrameSnapshots(
  top: string,
  parts: readonly { label: string; snapshot: string }[],
): string {
  const blocks = parts
    .filter((p) => p.snapshot.trim() !== '')
    .map((p) => {
      const body = p.snapshot
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n');
      return `- iframe ${JSON.stringify(p.label)}:\n${body}`;
    });
  return blocks.length === 0 ? top : [top, ...blocks].join('\n');
}

/** The live frame at a recorded path, or null when the page no longer has it. */
export function frameByPath(page: Page, path: string): Frame | null {
  let cur: Frame = page.mainFrame();
  for (const i of path.split('/')) {
    const next = cur.childFrames()[Number(i)];
    if (!next) return null;
    cur = next;
  }
  return cur;
}
