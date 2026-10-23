import type { CSSProperties } from 'react';

/** A box on the picture, in percent of the image (the server computes it from the page's layout). */
export interface ShotRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ShotProps {
  /** The recorded page's screenshot or wireframe URL. */
  src: string;
  alt: string;
  /** The changed region (designer v2-03, 12-v2-ux § 6). */
  region?: ShotRegion | null;
  /**
   * `here`: the region is outlined with "Changed" (the system pointing). `gone`: the same place on
   * the side without it, a dashed empty box with "Not here", so the eye finds where it isn't.
   */
  mark?: 'here' | 'gone';
  /** Overlay: a second page drawn over this one at 50 %, for small shifts (no region then). */
  over?: { src: string; alt: string } | null;
  /**
   * Several regions, each outlined and labelled (a record's cited elements, numbered). `note`: a
   * person's to-be on it (an amendment pin, `.sy-mark--note`, designer Q10).
   */
  marks?: readonly { region: ShotRegion; label: string; title?: string; note?: boolean }[];
}

// Layout only: the picture at full width, the mark and the overlay placed on it.
const FIGURE: CSSProperties = { position: 'relative', margin: 0 };
const IMAGE: CSSProperties = { display: 'block', width: '100%', height: 'auto' };
const OVER: CSSProperties = { ...IMAGE, position: 'absolute', inset: 0, opacity: 0.5 };
// The designer's dashed "same place" box (v2-03) has no class yet: F-01@064.
const GONE: CSSProperties = { background: 'transparent', outlineStyle: 'dashed' };

const at = (r: ShotRegion): CSSProperties => ({ left: `${String(r.left)}%`, top: `${String(r.top)}%`, width: `${String(r.width)}%`, height: `${String(r.height)}%` });

/**
 * A recorded page at full width (Before / after): the changed region marked on it, or a second page
 * drawn over it. The mark is the system pointing (`.sy-mark--overlay`), never a decoration.
 */
export function Shot({ src, alt, region, mark, over, marks = [] }: ShotProps) {
  return (
    <figure style={FIGURE}>
      <img src={src} alt={alt} style={IMAGE} />
      {over && <img src={over.src} alt={over.alt} style={OVER} />}
      {marks.map((m) => (
        <mark key={m.label} className={m.note ? 'sy-mark sy-mark--overlay sy-mark--note' : 'sy-mark sy-mark--overlay'} style={at(m.region)} title={m.title}>
          <span className="sy-mark__label">{m.label}</span>
        </mark>
      ))}
      {region && mark && !over && (
        <mark className="sy-mark sy-mark--overlay" style={{ ...at(region), ...(mark === 'gone' ? GONE : {}) }}>
          <span className="sy-mark__label">{mark === 'here' ? 'Changed' : 'Not here'}</span>
        </mark>
      )}
    </figure>
  );
}
