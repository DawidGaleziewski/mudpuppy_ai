import { useId, useRef, type CSSProperties } from 'react';
import { Anchor } from './Anchor.js';
import { thinTicks, useBoxWidth } from './axis.js';
import { shortScanId } from './ScanId.js';

/** One release of a portal part, placed in percent of the track (the server computes it). */
export interface ReleaseSpan {
  /** The release's short name: a marker's value, or a build hash's first 4 characters. */
  name: string;
  left: number;
  width: number;
  start: string;
  end: string;
  /** The release served now: a darker edge. */
  current?: boolean;
  /** Old and new served together: dashed. */
  rollout?: boolean;
  /** The part has no release marker (told apart by asset hashes): dashed and muted. */
  unknown?: boolean;
  /** Where the release leads (Changes from its start); plain text without it. */
  href?: string;
}

export interface ReleaseLane {
  /** The portal part ("Shell", "App kalkulator"). */
  name: string;
  scope: string;
  spans: ReleaseSpan[];
}

export interface ReleaseScan {
  id: string;
  left: number;
  at: string;
  status: string;
  /** A check run (◇, no AI) rather than an AI scan (■). */
  check?: boolean;
  href?: string;
}

export interface ReleasesProps {
  lanes: ReleaseLane[];
  scans: ReleaseScan[];
  /** The date axis under the tracks, in percent. */
  axis: { left: number; label: string }[];
  start: string;
  end: string;
  /** The chosen range: chalk brackets over the tracks, with its label. */
  range?: { left: number; width: number; label: string } | null;
}

// Layout only: the range spans the tracks, which start after the lane's name column.
const NAME = 'calc(var(--sy-releases-name, 140px) + var(--sy-space-3))';
const TRACK = `(100% - ${NAME})`;

function rangeStyle(left: number, width: number): CSSProperties {
  return { left: `calc(${NAME} + ${TRACK} * ${String(left / 100)})`, width: `calc(${TRACK} * ${String(width / 100)})` };
}

/** Where the range's label aligns (designer Q6): to an end the bracket touches, else centred. */
function labelAt(left: number, width: number): 'start' | 'end' | undefined {
  if (left + width >= 99.5) return 'end';
  if (left <= 0.5) return 'start';
  return undefined;
}

const spanClass = (s: ReleaseSpan) =>
  ['sy-releases__span', s.current && 'sy-releases__span--current', s.rollout ? 'sy-releases__span--rollout' : s.unknown && 'sy-releases__span--unknown']
    .filter(Boolean)
    .join(' ');

function Span({ s, lane }: { s: ReleaseSpan; lane: string }) {
  const style = { left: `${String(s.left)}%`, width: `${String(s.width)}%` };
  const title = `${s.name} · ${s.start} – ${s.end}`;
  const name = <span className="sy-case-normal sy-truncate">{s.name}</span>;
  return s.href ? (
    <Anchor className={spanClass(s)} href={s.href} style={style} title={title} aria-label={`Changes from release ${s.name} of ${lane}`}>
      {name}
    </Anchor>
  ) : (
    <span className={spanClass(s)} style={style} title={title}>
      {name}
    </span>
  );
}

function ScanMark({ s }: { s: ReleaseScan }) {
  const look = {
    className: s.check ? 'sy-releases__scan sy-releases__scan--check' : 'sy-releases__scan',
    style: { left: `${String(s.left)}%` },
    'aria-label': `${s.check ? 'Check run' : 'AI scan'} ${s.id}, ${s.at}, ${s.status}`,
  };
  const name = <span className="sy-case-normal">{shortScanId(s.id)}</span>;
  return s.href ? (
    <Anchor {...look} href={s.href}>
      {name}
    </Anchor>
  ) : (
    <span {...look}>{name}</span>
  );
}

function summary({ lanes, scans, start, end }: ReleasesProps): string {
  const parts = lanes.map((l) => `${l.name}: ${l.spans.map((s) => `${s.name}${s.rollout ? ' (rollout)' : ''} ${s.start} to ${s.end}`).join('; ')}.`);
  const seen = scans.length ? ` Scans: ${scans.map((s) => `${shortScanId(s.id)} ${s.at}`).join(', ')}.` : '';
  return `Release timeline, ${start} to ${end}. ${parts.join(' ')}${seen}`;
}

/**
 * Release lanes (designer v2-01 / v2-02): each portal part's releases over time, the scans under
 * them (■ AI scan, ◇ check run), the date axis and the chosen range. Releases are known from scans
 * only; a part without a release marker is dashed. Positions come from the server.
 */
export function Releases(props: ReleasesProps) {
  const { lanes, scans, axis, range } = props;
  const id = useId();
  const axisRef = useRef<HTMLDivElement>(null);
  const ticks = thinTicks(axis, useBoxWidth(axisRef));
  return (
    <>
      <p id={id} className="sy-sr-only">
        {summary(props)}
      </p>
      <div className={range ? 'sy-releases sy-releases--ranged' : 'sy-releases'} aria-describedby={id}>
        {lanes.length ? (
          lanes.map((lane) => (
            <div key={lane.scope} className="sy-releases__lane">
              <span className="sy-releases__name">
                {lane.name}
                <small>{lane.scope}</small>
              </span>
              <div className="sy-releases__track">
                {lane.spans.map((s) => (
                  <Span key={`${s.name}-${s.start}`} s={s} lane={lane.name} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="sy-releases__lane">
            <span className="sy-releases__name">
              Releases<small>unknown</small>
            </span>
            <div className="sy-releases__track">
              <span className="sy-releases__span sy-releases__span--unknown" style={{ left: 0, width: '100%' }}>
                release unknown
              </span>
            </div>
          </div>
        )}
        <div className="sy-releases__lane sy-releases__lane--scans">
          <span className="sy-releases__name">
            Scans<small>■ AI · ◇ check</small>
          </span>
          <div className="sy-releases__track">
            {scans.map((s) => (
              <ScanMark key={s.id} s={s} />
            ))}
          </div>
        </div>
        <div className="sy-releases__axis" aria-hidden="true" ref={axisRef}>
          {ticks.map((t) => (
            <span key={t.left} style={{ left: `${String(t.left)}%` }}>
              {t.label}
            </span>
          ))}
        </div>
        {range && (
          <div className="sy-releases__range" data-label={labelAt(range.left, range.width)} style={rangeStyle(range.left, range.width)}>
            <span>{range.label}</span>
          </div>
        )}
      </div>
      <p className="sy-legend" aria-hidden="true">
        <span>▭ release served</span>
        <span>┄ rollout or no marker</span>
        <span>■ AI scan</span>
        <span>◇ check run</span>
        {range && <span>[ ] this range</span>}
      </p>
    </>
  );
}
