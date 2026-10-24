import type { ReactNode } from 'react';
import { cx } from '../cx.js';

/** A step of the token spacing scale (`--sy-space-1` … `--sy-space-9`); 0 is none. */
export type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** A text tone: a role token, never a colour (rule 8: a status is a `Status`, not a red word). */
export type Tone = 'default' | 'muted' | 'intent' | 'ok' | 'active' | 'tobe' | 'fail';

/** A surface: the role tokens of the plates and their tints. */
export type Surface = 'ground' | 'well' | 'plate' | 'raised' | 'intent-tint' | 'tobe-tint' | 'fail-tint';

const SPACING = ['m', 'mt', 'mr', 'mb', 'ml', 'mx', 'my', 'p', 'pt', 'pr', 'pb', 'pl', 'px', 'py', 'gap'] as const;
type SpacingProp = (typeof SPACING)[number];

export type BoxProps = { [K in SpacingProp]?: Space } & {
  /** The element: a `div` by default; `span` inside text, `section` with a `label`. */
  as?: 'div' | 'span' | 'section' | 'ul' | 'ol' | 'li';
  /** Its accessible name, for a `section`. */
  label?: string;
  tone?: Tone;
  surface?: Surface;
  border?: 'weld' | 'plate' | 'control';
  display?: 'block' | 'inline-block' | 'flex' | 'inline-flex' | 'grid' | 'hidden';
  /** With `display="flex"`: a column instead of a row. */
  column?: boolean;
  wrap?: boolean;
  align?: 'start' | 'center' | 'end';
  justify?: 'start' | 'center' | 'end' | 'between';
  /** Takes the space left in a flex row (and may shrink below its content). */
  grow?: boolean;
  /** As wide as its container. */
  full?: boolean;
  children?: ReactNode;
};

/** The token utility classes (`styles/utilities.css`) a set of props stands for. */
export function utilityClasses(p: BoxProps): string {
  return cx(
    ...SPACING.map((k) => p[k] !== undefined && `u-${k}-${String(p[k])}`),
    p.tone && `u-text-${p.tone}`,
    p.surface && `u-bg-${p.surface}`,
    p.border && `u-border-${p.border}`,
    p.display && `u-${p.display}`,
    p.column && 'u-flex-col',
    p.wrap && 'u-wrap',
    p.align && `u-items-${p.align}`,
    p.justify && `u-justify-${p.justify}`,
    p.grow && 'u-grow u-min-w-0',
    p.full && 'u-w-full',
  );
}

/**
 * A box spaced, toned and arranged with the token utilities only (skill frontend-architecture § 4):
 * `<Box mt={4} tone="muted">`. The way a page adjusts space without a class name or a style; a
 * rebrand changes the tokens behind every value. Use `Stack`, `Cluster` and the other layout
 * components first; `Box` is for what they do not cover.
 */
export function Box({ as: Tag = 'div', label, children, ...props }: BoxProps) {
  return (
    <Tag className={utilityClasses(props) || undefined} aria-label={label}>
      {children}
    </Tag>
  );
}
