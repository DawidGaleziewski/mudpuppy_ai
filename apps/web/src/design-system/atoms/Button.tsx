import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx.js';
import { Anchor } from './Anchor.js';

export type ButtonVariant = 'default' | 'primary' | 'strong' | 'quiet' | 'danger';

interface Common {
  /**
   * `primary`: spray paint, the one main action of a view (at most one per view, rule 2).
   * `strong`: the main action inside a card. `quiet`: secondary. `danger`: destructive, with a
   * dialog before it does anything.
   */
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  /** Working: shows the busy state and refuses clicks. */
  busy?: boolean;
  children: ReactNode;
}

export type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement>;

const classes = (variant: ButtonVariant, size: Common['size']) =>
  cx(
    'sy-btn',
    variant !== 'default' && `sy-btn--${variant}`,
    size === 'sm' && 'sy-btn--sm',
    size === 'md' && 'sy-btn--md',
  );

/**
 * A button: it changes something (a link that only navigates is a `LinkButton` or a plain link).
 * Sentence case in the text; the CSS sets the caps of short labels.
 */
export function Button({
  variant = 'default',
  size,
  busy = false,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx(classes(variant, size), className)}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  );
}

export type LinkButtonProps = Omit<Common, 'busy'> & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** A link drawn as a button, for a move to another page that is the view's main way on. */
export function LinkButton({ variant = 'default', size, children, className, ...rest }: LinkButtonProps) {
  return (
    <Anchor {...rest} className={cx(classes(variant, size), className)}>
      {children}
    </Anchor>
  );
}
