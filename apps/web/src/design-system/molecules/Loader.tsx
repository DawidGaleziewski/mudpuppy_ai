import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../cx.js';

export interface LoaderProps {
  /** What is loading, with a count when there is one ("Loading screens · 12 of 23"). Never "Please wait". */
  children: ReactNode;
  /** `sm`: toolbars, table heads, menus ("Updating"); `block`: centred in a box of its final size. */
  size?: 'sm' | 'block';
}

/**
 * The loader (designer T-10, D-74): three weld beads, the running pulse in turn, and what is
 * loading. A polite status, announced once. Not for a button at work (`busy`) or the assistant
 * composing (its blueprint skeleton).
 */
export function Loader({ children, size }: LoaderProps) {
  return (
    <span className={cx('sy-loader', size === 'sm' && 'sy-loader--sm', size === 'block' && 'sy-loader--block')} role="status">
      <span className="sy-loader__beads" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="sy-loader__label">{children}</span>
    </span>
  );
}

export interface ReserveProps {
  /** The final height in px (a graph's layout height, 520 embedded). */
  height?: number;
  /** Or the final shape as width / height (a recording: 1280 / 800). */
  ratio?: number;
  /** A picture's box: paper, not steel. */
  paper?: boolean;
  /** Usually a `Loader size="block"`. */
  children?: ReactNode;
}

/** A box that already has its final size while its content loads (`.sy-reserve`): a graph, a diagram, a picture. */
export function Reserve({ height, ratio, paper = false, children }: ReserveProps) {
  const size = { ...(height !== undefined && { '--sy-reserve-h': `${String(height)}px` }), ...(ratio !== undefined && { '--sy-ratio': String(ratio) }) } as CSSProperties;
  return (
    <div className={cx('sy-reserve', paper && 'sy-reserve--paper')} style={size}>
      {children}
    </div>
  );
}

export interface BusyProps {
  /** A list re-loading (a filter, a page): its old rows stay, dimmed, until the new ones arrive. */
  busy: boolean;
  /** What is updating, beside the list ("Updating"). */
  label?: string;
  children: ReactNode;
}

/**
 * A region whose content is being read again (designer T-10 Q7.4): the old content stays, dimmed
 * with `aria-busy`, and a small loader "Updating" sits under the header's right end, out of the
 * flow, so nothing moves. The wrapper takes no box of its own (`display: contents`).
 */
export function Busy({ busy, label = 'Updating', children }: BusyProps) {
  return (
    <div className="sy-busy" aria-busy={busy}>
      {busy && (
        <span className="sy-busy__note">
          <Loader size="sm">{label}</Loader>
        </span>
      )}
      {children}
    </div>
  );
}
