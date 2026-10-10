/// <reference lib="dom" />
import { buildLayout, type AriaJsonNode, type Layout } from '@pathfinder/core';
import type { Page } from 'playwright';
import { PAGE_ROOT } from './observer.js';
import { evalInPage } from './in-page.js';

/** Screenshots taller than this (CSS px) are cut; the layout records `cut: true` (spec 008 FR-006). */
export const MAX_SCREENSHOT_HEIGHT = 10_000;

export interface CapturedVisuals {
  /** Unmasked PNG in CSS pixels (constitution 2.0.0). */
  png: Buffer;
  layout: Layout;
}

export interface CaptureOptions {
  maxHeight?: number;
  /** Mask applied to element names before keying, when the portal scrubs PII. */
  mask?: (text: string) => string;
  timeoutMs?: number;
}

/** Width and height of a PNG from its IHDR chunk. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

/**
 * Screenshot and layout of the page as it is now (spec 008 research R1, R3). Called right after
 * the state's ARIA snapshot and before any action, so the image, the boxes and the snapshot show
 * the same page. Boxes come from the same ARIA tree as the snapshot, so their element keys match.
 */
export async function captureVisuals(
  page: Page,
  opts: CaptureOptions = {},
): Promise<CapturedVisuals> {
  const maxHeight = opts.maxHeight ?? MAX_SCREENSHOT_HEIGHT;
  const timeout = opts.timeoutMs ?? 15_000;
  const metrics = await evalInPage(page, () => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    scrollHeight: Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
    ),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  const tree = (await page
    .locator(PAGE_ROOT)
    .first()
    .ariaSnapshotJSON({ boxes: true, timeout })) as unknown as AriaJsonNode[];
  const cut = metrics.scrollHeight > maxHeight;
  const png = await page.screenshot({
    type: 'png',
    fullPage: true,
    scale: 'css',
    animations: 'disabled',
    caret: 'hide',
    timeout,
    ...(cut ? { clip: { x: 0, y: 0, width: metrics.innerWidth, height: maxHeight } } : {}),
  });
  const size = pngSize(png);
  const layout = buildLayout({
    tree,
    scrollX: metrics.scrollX,
    scrollY: metrics.scrollY,
    viewport: { width: metrics.innerWidth, height: metrics.innerHeight },
    page: size,
    cut,
    ...(opts.mask ? { mask: opts.mask } : {}),
  });
  return { png, layout };
}
