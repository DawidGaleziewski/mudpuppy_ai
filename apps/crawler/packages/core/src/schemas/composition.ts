import { z } from 'zod';

/** How a clickable without a role was found (spec 015). */
export const FoundBy = z.enum(['listener', 'inline', 'framework', 'cursor', 'tabindex']);
export type FoundBy = z.infer<typeof FoundBy>;

/** Where a form field's name came from (spec 015). */
export const FieldNameSource = z.enum([
  'label',
  'aria',
  'placeholder',
  'nearby_text',
  'name',
  'id',
  'position',
]);
export type FieldNameSource = z.infer<typeof FieldNameSource>;

export const CompositionLoader = z.enum(['importmap', 'systemjs', 'requirejs', 'dynamic_import']);
export type CompositionLoader = z.infer<typeof CompositionLoader>;

/** What a page is made of: frames, micro-frontend mounts, module loaders, clickable counts. */
export const PageComposition = z.object({
  frames: z.array(
    z.object({
      /** "" for the top document, "0", "0/1" for nested frames (child index). */
      path: z.string(),
      url: z.string(),
      name: z.string().nullable(),
      title: z.string().nullable(),
      origin: z.string(),
      /** True when the frame's content is in the snapshot. */
      observed: z.boolean(),
      depth: z.number().int().nonnegative(),
    }),
  ),
  /** Frames deeper than the frame depth. */
  frames_skipped: z.number().int().nonnegative(),
  mounts: z.array(
    z.object({
      selector: z.string(),
      frame: z.string(),
      filled: z.boolean(),
      waited_ms: z.number().int().nonnegative(),
      /** Full bundle URLs. */
      bundles: z.array(z.string()),
    }),
  ),
  loaders: z.array(CompositionLoader),
  clickables: z.object({
    found: z.number().int().nonnegative(),
    issued: z.number().int().nonnegative(),
    capped: z.number().int().nonnegative(),
  }),
});
export type PageComposition = z.infer<typeof PageComposition>;
