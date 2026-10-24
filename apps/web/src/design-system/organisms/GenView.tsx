import { useId, useState, type ReactNode } from 'react';
import { cx } from '../cx.js';
import { Button } from '../atoms/Button.js';
import { Status, type StatusProps } from '../atoms/Status.js';
import { Facts } from '../molecules/Facts.js';

/** The lead frame's "Why this view?" (designer 16-genui-components.md § 5.4): only the spec's words and the server's. */
export interface GenWhy {
  /** "Mapping · picked by the assistant". */
  path: string;
  because: string;
  asked?: string | null | undefined;
  shows: readonly string[];
  data: string;
  /** The other paths the person can switch to, as (key, word). */
  switches?: readonly (readonly [string, string])[];
  onSwitch?: (path: string) => void;
}

export interface GenFeedbackProps {
  /** yes · no · null (not answered). */
  value: string | null;
  /** The reasons picked after No. */
  reasons: readonly string[];
  /** Every reason, as (key, word). */
  choices: readonly (readonly [string, string])[];
  onAnswer: (answer: { value: string; toggle?: string; text?: string }) => void;
}

/** Right view? Yes / No (§ 5.5); No opens the reasons, each a toggle, and a line of text. */
export function GenFeedback({ value, reasons, choices, onAnswer }: GenFeedbackProps) {
  const [text, setText] = useState('');
  return (
    <div className="sy-genfeedback" role="group" aria-label="Was this the right view?">
      <span>Right view?</span>
      {(['yes', 'no'] as const).map((v) => (
        <button key={v} className="sy-genfeedback__btn" type="button" aria-pressed={value === v} onClick={() => onAnswer({ value: v })}>
          {v === 'yes' ? 'Yes' : 'No'}
        </button>
      ))}
      {value === 'no' && (
        <div className="sy-genfeedback__why">
          {choices.map(([key, word]) => (
            <button key={key} className="sy-genfeedback__btn" type="button" aria-pressed={reasons.includes(key)} onClick={() => onAnswer({ value: 'no', toggle: key })}>
              {word}
            </button>
          ))}
          <label className="sy-field">
            <span className="sy-sr-only">What was wrong? (optional)</span>
            <input
              className="sy-input sy-input--md"
              type="text"
              placeholder="What was wrong? (optional)"
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => text && onAnswer({ value: 'no', text })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export interface GenViewProps {
  /** Its place in the page (`t1-map`): the live bar jumps here. */
  id: string;
  title: ReactNode;
  /** A route as the title keeps its case. */
  titleAsIs?: boolean;
  /** "From events up to 10:58:44Z". */
  source: string;
  /** Inline placement: inside a chat message. */
  card?: boolean;
  failure?: boolean;
  /** ready · composing · stale. */
  state?: string;
  /** A live frame's status (Running, Stopped). */
  status?: StatusProps | null;
  why?: GenWhy | null;
  feedback?: GenFeedbackProps | null;
  /** Placed by the server, not the model (the live map at a scan's start, designer T-13): no "generated" mark, no Why. */
  placed?: boolean;
  children: ReactNode;
}

function WhyPanel({ id, why }: { id: string; why: GenWhy }) {
  return (
    <div className="sy-genwhy" id={id}>
      <Facts
        items={[
          ['Path', why.path],
          ['Because', why.because],
          ...(why.asked ? [['You asked', `"${why.asked}"`] as const] : []),
          ['Shows', why.shows.join(' · ')],
          ['Data', why.data],
        ]}
      />
      {why.switches && why.switches.length > 0 && (
        <div className="sy-genwhy__switch">
          <span className="sy-small">Not what you need?</span>
          {why.switches.map(([key, word]) => (
            <Button key={key} size="sm" variant="quiet" onClick={() => why.onSwitch?.(key)}>
              {`Switch to ${word}`}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The frame's title with the "generated" mark (none when the server placed it) and its status. */
function GenTitle({ head, title, asIs, placed, status }: { head: string; title: ReactNode; asIs: boolean; placed: boolean; status: StatusProps | null | undefined }) {
  return (
    <div className="sy-genview__title">
      <h3 id={head} className={cx('sy-plate__title', asIs && 'sy-case-normal')}>
        {title}
        {!placed && <span className="sy-sr-only">, generated</span>}
      </h3>
      {!placed && (
        <span className="sy-genmark" aria-hidden="true">
          generated
        </span>
      )}
      {status && <Status {...status} />}
    </div>
  );
}

/**
 * A frame the assistant generated (designer § 5.3): the "generated" mark, its status, "Why this
 * view?" and "Right view?" on the lead frame, the source of its data under it. The model's words
 * arrive as plain strings only.
 */
export function GenView({ id, title, titleAsIs = false, source, card = false, failure = false, state = 'ready', status, why, feedback, placed = false, children }: GenViewProps) {
  const head = useId();
  const [open, setOpen] = useState(false);
  return (
    <section
      id={id}
      className={cx('sy-genview', card && 'sy-genview--card', failure && 'sy-genview--failure')}
      data-gen-state={state}
      aria-labelledby={head}
      aria-live={card ? 'off' : undefined}
    >
      <header className="sy-genview__head">
        <GenTitle head={head} title={title} asIs={titleAsIs} placed={placed} status={status} />
        {why && (
          <div className="sy-genview__tools">
            <button className="sy-genview__why" type="button" aria-expanded={open} aria-controls={`${id}-why`} onClick={() => setOpen(!open)}>
              Why this view?
            </button>
          </div>
        )}
      </header>
      {why && open && <WhyPanel id={`${id}-why`} why={why} />}
      <div className="sy-genview__body">{children}</div>
      <footer className="sy-genview__foot">
        <span className="sy-genview__source">{source}</span>
        {feedback && <GenFeedback {...feedback} />}
      </footer>
    </section>
  );
}
