import type { CSSProperties } from 'react';

/** A box on the picture, in percent of the image (the server computes it from the page's layout). */
export interface ShotRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a change is not, on the side without it (designer Q5a, `.sy-mark--gone`): a dashed `box` at
 * the region's place for things that float, a dashed `line` at the insertion point for a region
 * that was inserted and pushed the content below it. In percent of this picture.
 */
export interface ShotGone extends ShotRegion {
  shape: 'box' | 'line';
}

export interface ShotProps {
  /** The recorded page's screenshot or wireframe URL. */
  src: string;
  alt: string;
  /** The changed region, outlined with "Changed" (the system pointing; designer v2-03, 12-v2-ux § 6). */
  region?: ShotRegion | null;
  /** "Not here": the change's place on the side without it. Decoration; say it in `alt` too. */
  gone?: ShotGone | null;
  /**
   * Several regions, each outlined and labelled (a record's cited elements, numbered). `note`: a
   * person's to-be on it (an amendment pin, `.sy-mark--note`, designer Q10).
   */
  marks?: readonly { region: ShotRegion; label: string; title?: string; note?: boolean }[];
  /**
   * Its layer in a `CompareOverlay`: `under` the before, `over` the after (its picture drawn at the
   * overlay's mix, its marks at full strength, hidden from screen readers: the under side says it).
   */
  layer?: 'under' | 'over';
}

// Layout only: the picture at full width, the marks placed on it.
const FIGURE: CSSProperties = { position: 'relative', margin: 0 };
const IMAGE: CSSProperties = { display: 'block', width: '100%', height: 'auto' };

const at = (r: ShotRegion): CSSProperties => ({ left: `${String(r.left)}%`, top: `${String(r.top)}%`, width: `${String(r.width)}%`, height: `${String(r.height)}%` });
const lineAt = (r: ShotRegion): CSSProperties => ({ left: `${String(r.left)}%`, top: `${String(r.top)}%`, width: `${String(r.width)}%` });

/**
 * A recorded page at full width (Before / after, a recording): the changed region marked on it, or
 * where it is not, or a record's cited elements. A mark is the system pointing, never decoration.
 */
export function Shot({ src, alt, region, gone, marks = [], layer }: ShotProps) {
  const over = layer === 'over';
  return (
    <figure style={FIGURE} className={layer && `sy-compare__${layer}`} aria-hidden={over || undefined}>
      <img src={src} alt={over ? '' : alt} style={IMAGE} />
      {marks.map((m) => (
        <mark key={m.label} className={m.note ? 'sy-mark sy-mark--overlay sy-mark--note' : 'sy-mark sy-mark--overlay'} style={at(m.region)} title={m.title}>
          <span className="sy-mark__label">{m.label}</span>
        </mark>
      ))}
      {region && (
        <mark className="sy-mark sy-mark--overlay" style={at(region)}>
          <span className="sy-mark__label">Changed</span>
        </mark>
      )}
      {gone && (
        <span className="sy-mark sy-mark--overlay sy-mark--gone" data-shape={gone.shape === 'line' ? 'line' : undefined} aria-hidden="true" style={gone.shape === 'line' ? lineAt(gone) : at(gone)}>
          <span className="sy-mark__label">Not here</span>
        </span>
      )}
    </figure>
  );
}
