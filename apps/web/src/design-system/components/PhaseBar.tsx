import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { thinTicks, useBoxWidth, type AxisTick } from './axis.js';

/** One phase of a scan, as the server cut it (the bar never invents one). */
export interface BarPhase {
  name: string;
  /** `work`; `wait`: Waiting for you (the only orange); `quiet`: no new step for a minute or more. */
  kind: 'work' | 'wait' | 'quiet';
  /** `running`: the open end of a running scan; `failed`: it ended in a failure (a red end cap). */
  state: 'done' | 'running' | 'failed';
  /** Its length: its share of the bar. */
  seconds: number;
  /** Its last step, for the failure's words. */
  lastStep: number | null;
  /** "10:49:20Z · 11 s · steps 1–11" */
  timeLine: string;
}

export interface PhaseBarProps {
  /** The caption: "Phases · AI scan 01a110d5-2028 · 9 min 24 s" and the scan's status. */
  caption: ReactNode;
  phases: readonly BarPhase[];
  /** The time axis under the bar, in percent; both ends always shown. */
  axis: readonly AxisTick[];
  /** The pressed phase's index, or null. */
  selected: number | null;
  /** Pressing a phase filters what is under the bar; pressing it again clears it. */
  onSelect: (index: number | null) => void;
}

/** Under this width a phase shows its name only (the time line stays for screen readers). */
const NARROW = 72;

function stateWords(p: BarPhase): string | null {
  if (p.state === 'running') return ', running';
  if (p.state === 'failed') return p.lastStep === null ? ', ended in a failure' : `, ended in a failure at step ${String(p.lastStep)}`;
  return null;
}

/**
 * A scan's time cut into its phases (designer 19/02, `.sy-phasebar`): one bar, each phase a button
 * as wide as its share of the time (at least 24 px), its name and a time line. Pressing a phase
 * filters what is under the bar (`aria-pressed`); one at a time. Waiting for you is the only orange,
 * a failure only a red end cap, a running scan's end dashed. The axis keeps its ends and thins
 * the round times between to 64 px apart.
 */
export function PhaseBar({ caption, phases, axis, selected, onSelect }: PhaseBarProps) {
  const id = useId();
  const track = useRef<HTMLOListElement>(null);
  const width = useBoxWidth(track);
  const axisRef = useRef<HTMLDivElement>(null);
  const ticks = thinTicks(axis, useBoxWidth(axisRef));
  const total = phases.reduce((s, p) => s + p.seconds, 0) || 1;
  return (
    <figure className="sy-phasebar" aria-labelledby={id}>
      <figcaption id={id}>{caption}</figcaption>
      <ol className="sy-phasebar__track" ref={track}>
        {phases.map((p, i) => {
          const narrow = width > 0 && (width * p.seconds) / total < NARROW;
          const said = stateWords(p);
          return (
            <li
              key={i}
              className="sy-phasebar__phase"
              data-kind={p.kind}
              data-state={p.state === 'done' ? undefined : p.state}
              data-narrow={narrow ? '' : undefined}
              style={{ '--sy-phase': String(p.seconds) } as CSSProperties}
            >
              <button className="sy-phasebar__btn" type="button" aria-pressed={selected === i} title={`${p.name} · ${p.timeLine}`} onClick={() => onSelect(selected === i ? null : i)}>
                <span className="sy-phasebar__name">{p.name}</span>
                <span className="sy-sr-only">, </span>
                <span className="sy-phasebar__time">{p.timeLine}</span>
                {said && <span className="sy-sr-only">{said}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="sy-phasebar__axis" aria-hidden="true" ref={axisRef}>
        {ticks.map((t) => (
          <span key={t.left} style={{ left: `${String(t.left)}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** The phase bar's legend, once per page under it: Working · Waiting for you · Quiet · Running · Ended in a failure. */
export function PhaseKey() {
  const items: [string, { 'data-kind'?: string; 'data-state'?: string }][] = [
    ['Working', { 'data-kind': 'work' }],
    ['Waiting for you', { 'data-kind': 'wait' }],
    ['Quiet', { 'data-kind': 'quiet' }],
    ['Running', { 'data-state': 'running' }],
    ['Ended in a failure', { 'data-state': 'failed' }],
  ];
  return (
    <ul className="sy-legend" aria-label="Phases">
      {items.map(([word, data]) => (
        <li key={word} className="sy-legend__item">
          <span className="sy-phasebar__key" {...data} aria-hidden="true" />
          {word}
        </li>
      ))}
    </ul>
  );
}
