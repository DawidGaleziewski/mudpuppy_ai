import type { ReactNode } from 'react';
import { cx } from '../cx.js';
import { Anchor } from './Anchor.js';

/** The look props (documented on `TextProps`), each with the class it adds. */
const LOOKS = {
  mono: 'sy-mono',
  route: 'sy-route',
  muted: 'sy-muted',
  small: 'sy-small',
  asIs: 'sy-case-normal',
  drawn: 'sy-drawn-text',
  removed: 'sy-diff--removed',
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
  /** A proposed value, not yet applied (rule 3, to-be is drawn): an assistant's new wording. */
  drawn?: boolean;
  /** A value a change replaces, struck through: the "before" of a before → after. */
  removed?: boolean;
  /** A paragraph instead of a run of text inside a line. */
  block?: boolean;
  /** Important within its line: who answered, the name a sentence is about (`<strong>`). */
  strong?: boolean;
  /** A link to another page, in this face (a process name, a route family). */
  href?: string;
  /** The language of a stored value in the portal's words ("pl"), for screen readers. */
  lang?: string | null | undefined;
}

/** Inline text in one of the system's faces and tones: pages never set a face or a size themselves. */
export function Text({ children, block, strong, href, lang, ...looks }: TextProps) {
  const className =
    cx(...(Object.keys(LOOKS) as (keyof typeof LOOKS)[]).map((k) => looks[k] === true && LOOKS[k])) ||
    undefined;
  const language = lang ?? undefined;
  if (block)
    return (
      <p className={className} lang={language}>
        {children}
      </p>
    );
  if (href !== undefined)
    return (
      <Anchor className={className} href={href} lang={language}>
        {children}
      </Anchor>
    );
  const Inline = strong ? 'strong' : 'span';
  return (
    <Inline className={className} lang={language}>
      {children}
    </Inline>
  );
}

/**
 * The heading of a part inside a plate ("Variants · 3"): an `h3` in the label face. `section`: a
 * section of the page outside a plate ("What differs", "3 changes"), an `h2`; with `asIs` it keeps
 * the stored case (a finding's sentence, never in caps).
 */
export function SubHead({ children, section, asIs }: { children: ReactNode; section?: boolean; asIs?: boolean }) {
  if (section) return <h2 className={asIs ? 'sy-h2 sy-case-normal' : 'sy-h2'}>{children}</h2>;
  return <h3 className="sy-label">{children}</h3>;
}
