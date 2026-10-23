import type { ReactNode } from 'react';
import { cx } from '../cx.js';

/** The look props (documented on `TextProps`), each with the class it adds. */
const LOOKS = {
  mono: 'sy-mono',
  route: 'sy-route',
  muted: 'sy-muted',
  small: 'sy-small',
  asIs: 'sy-case-normal',
} as const;

export interface TextProps {
  children: ReactNode;
  /** An identifier, a timestamp: the mono face. */
  mono?: boolean;
  /** A page route or URL path: small mono, muted, breaks anywhere. */
  route?: boolean;
  /** Secondary text. */
  muted?: boolean;
  small?: boolean;
  /**
   * A stored value shown as it is, also inside a caps context (a row header, a plate title): a
   * screen title, a process name (rule 5, show stored values exactly).
   */
  asIs?: boolean;
  /** A paragraph instead of a run of text inside a line. */
  block?: boolean;
  /** Important within its line: who answered, the name a sentence is about (`<strong>`). */
  strong?: boolean;
}

/** Inline text in one of the system's faces and tones: pages never set a face or a size themselves. */
export function Text({ children, block, strong, ...looks }: TextProps) {
  const className =
    cx(...(Object.keys(LOOKS) as (keyof typeof LOOKS)[]).map((k) => looks[k] === true && LOOKS[k])) ||
    undefined;
  if (block) return <p className={className}>{children}</p>;
  const Inline = strong ? 'strong' : 'span';
  return <Inline className={className}>{children}</Inline>;
}
