import type { ReactNode } from 'react';

export interface RowPictureProps {
  /** The main variant's latest picture; none: the hatched "no picture" box. */
  src?: string | null | undefined;
  /** The picture's text alternative (the screen's title); its button is named by it plus ", enlarge". */
  alt: string;
  /** Why there is none ("not recorded yet", "behind a login"): shown under the title. */
  missing?: string;
  /** Opens the picture dialog browsing the list (designer T-04). */
  onOpen?: () => void;
  /** A key the list finds the button by, to return focus to the screen last viewed. */
  pick?: string;
  /** The title and route beside it (the title stays the link to the screen's page). */
  children: ReactNode;
}

/**
 * A picture per row in a list of screens (designer T-03, D-67, FE-V33): left of the title, 96 px
 * wide (72 in a dense table, 64 on a phone), its box sized from the start so the row never grows
 * when the image arrives; a hatched "no picture" box with the reason, never an empty one.
 */
export function RowPicture({ src, alt, missing, onOpen, pick, children }: RowPictureProps) {
  return (
    <span className="sy-rowpic">
      {src ? (
        <button type="button" className="sy-thumb-btn" aria-haspopup="dialog" onClick={onOpen} data-pick={pick}>
          <img className="sy-thumb sy-thumb--row" src={src} width={96} height={60} loading="lazy" decoding="async" alt={alt} />
          <span className="sy-sr-only">, enlarge</span>
        </button>
      ) : (
        <span className="sy-thumb sy-thumb--row sy-thumb--none" aria-hidden="true">
          no picture
        </span>
      )}
      <span className="u-flex u-flex-col u-gap-1 u-min-w-0">
        {children}
        {!src && missing && <span className="sy-small sy-muted">{`No picture: ${missing}`}</span>}
      </span>
    </span>
  );
}
