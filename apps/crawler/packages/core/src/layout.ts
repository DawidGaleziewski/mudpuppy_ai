import { z } from 'zod';
import { walkKeyed, type AriaJsonNode } from './element-key.js';

/**
 * Layout of a recorded state (spec 008 data-model.md): its keyed elements with bounding boxes in
 * screenshot (page) coordinates. Stored as an evidence JSON blob, referenced by `states.layout_ref`.
 */
export const Box = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Box = z.infer<typeof Box>;

export const LayoutElement = z.object({
  key: z.string().min(1),
  role: z.string().min(1),
  name: z.string(),
  box: Box.nullable(),
});
export type LayoutElement = z.infer<typeof LayoutElement>;

export const Layout = z.object({
  version: z.literal(1),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  /** Size of the screenshot: `height` is cut at the maximum when `cut`. */
  page: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  cut: z.boolean(),
  elements: z.array(LayoutElement),
});
export type Layout = z.infer<typeof Layout>;

export interface BuildLayoutInput {
  /** `locator('body').ariaSnapshotJSON({ boxes: true })`, boxes relative to the viewport. */
  tree: readonly AriaJsonNode[];
  scrollX: number;
  scrollY: number;
  viewport: { width: number; height: number };
  /** Screenshot size in CSS px (already cut). */
  page: { width: number; height: number };
  cut: boolean;
  /** Applied to names before keying when the portal scrubs PII, so keys match the stored YAML. */
  mask?: (text: string) => string;
}

type RawBox = { x: number; y: number; width: number; height: number };
interface BoxedNode {
  role: string;
  name?: string;
  box?: RawBox;
  children: BoxedNode[];
}

/**
 * Key the tree's elements and convert their boxes to page coordinates. A box is null when it has
 * no area, lies wholly outside the screenshot (left, above, or below the cut) or is missing.
 */
export function buildLayout(input: BuildLayoutInput): Layout {
  const { page } = input;
  const nodes = (list: readonly AriaJsonNode[]): BoxedNode[] =>
    list.flatMap((n) =>
      typeof n === 'string'
        ? []
        : [
            {
              role: n.role,
              ...(n.name !== undefined && n.name !== ''
                ? { name: input.mask ? input.mask(n.name) : n.name }
                : {}),
              ...(n.box ? { box: n.box } : {}),
              children: nodes(n.children ?? []),
            },
          ],
    );

  const elements: LayoutElement[] = [];
  walkKeyed(nodes(input.tree), (n, el) => {
    elements.push({ key: el.key, role: el.role, name: el.name, box: toPageBox(n.box) });
  });

  function toPageBox(b: RawBox | undefined): Box | null {
    if (!b) return null;
    const x0 = Math.max(0, Math.round(b.x + input.scrollX));
    const y0 = Math.max(0, Math.round(b.y + input.scrollY));
    const x1 = Math.min(page.width, Math.round(b.x + input.scrollX + b.width));
    const y1 = Math.min(page.height, Math.round(b.y + input.scrollY + b.height));
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  return {
    version: 1,
    viewport: {
      width: Math.round(input.viewport.width),
      height: Math.round(input.viewport.height),
    },
    page: { width: Math.round(page.width), height: Math.round(page.height) },
    cut: input.cut,
    elements,
  };
}
