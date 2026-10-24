import type { CSSProperties, ReactNode } from 'react';
import { Anchor } from '../atoms/Anchor.js';
import { Status, type StatusProps } from '../atoms/Status.js';

// Layout only: the thumbnail's height, and the mock lines' widths when no screenshot was recorded.
const miniH = (h: number) => ({ '--sy-mini-h': `${String(h)}px` }) as CSSProperties;
const W = (w: string): CSSProperties => ({ width: w });

/** A recorded page as a small picture (`.sy-mini`); a page without a screenshot draws its outline. */
export function Mini({ src, height = 46 }: { src?: string | null | undefined; height?: number }) {
  if (src)
    return (
      <span className="sy-mini" aria-hidden="true" style={miniH(height)}>
        <img className="sy-mini__img" src={src} alt="" />
      </span>
    );
  return (
    <span className="sy-mini sy-mini--mock" aria-hidden="true" style={miniH(height)}>
      <b style={W('60%')} />
      <i style={W('90%')} />
      <i className="l" style={W('45%')} />
    </span>
  );
}

export interface FilmItemProps {
  order?: number;
  route: string;
  picture?: string | null | undefined;
  /** here · failed · frontier · none (visited). */
  state?: 'here' | 'failed' | 'frontier' | null;
  status: StatusProps;
  sidePages?: number;
  pictureHeight?: number;
  /** Selected: its page details are open in the side sheet. */
  pressed?: boolean;
  onSelect?: () => void;
}

/** One page of a scan's filmstrip (WB-UI-07): a button that selects it; here and failed in words. */
export function FilmItem({ order, route, picture, state, status, sidePages = 0, pictureHeight, pressed = false, onSelect }: FilmItemProps) {
  const inner = (
    <>
      {order !== undefined && <span className="sy-order">{order}</span>}
      {state !== 'frontier' && <Mini src={picture} {...(pictureHeight ? { height: pictureHeight } : {})} />}
      <span className="sy-film__route">{route}</span>
      <Status {...status} />
      {sidePages > 0 && <span className="sy-chip">{`+${String(sidePages)} side pages`}</span>}
    </>
  );
  if (!onSelect)
    return (
      <div className="sy-film__item" data-state={state ?? undefined}>
        {inner}
      </div>
    );
  return (
    <button className="sy-film__item sy-askable" type="button" data-state={state ?? undefined} aria-pressed={pressed} onClick={onSelect}>
      {inner}
    </button>
  );
}

/** A scan's pages in visit order (`.sy-film`). */
export function Film({ children, label = 'Pages visited, in order' }: { children: ReactNode; label?: string }) {
  return (
    <div className="sy-film" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export interface NarrationLine {
  at: string;
  /** Shown as HH:MM:SSZ. */
  clock: string;
  text: string;
  step: number;
  /** visit · milestone · stop · live. */
  kind: string;
  ref: string;
}

/** Narration (WB-UI-17…19): templated lines in the assistant's dashed voice, each citing its event. */
export function Narration({ lines, onAsk }: { lines: readonly NarrationLine[]; onAsk?: (ref: string) => void }) {
  return (
    <ol className="sy-narration" aria-label="What the crawler did" aria-live="off">
      {lines.map((l) => (
        <li key={l.ref} className="sy-askable" data-kind={l.kind === 'visit' ? undefined : l.kind}>
          <time dateTime={l.at}>{l.clock}</time>
          <span>
            {l.text}
            <span className="sy-cite" title={`Event ${l.ref}`}>{`step ${String(l.step)}`}</span>
          </span>
          {onAsk && (
            <button className="sy-ask" type="button" onClick={() => onAsk(l.ref)}>
              Ask
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The live bar (WB-UI-16): a running scan pinned above the conversation, with the way to its card. */
export function LiveBar({ children, href }: { children: ReactNode; href: string }) {
  return (
    <div className="sy-livebar">
      <span className="sy-livebar__main">
        <span className="sy-label">Pinned</span>
        <Status status="running">Running</Status>
        <span>{children}</span>
      </span>
      <Anchor className="sy-small" href={href}>
        Jump to the live card
      </Anchor>
    </div>
  );
}

export interface PathSwitchProps {
  paths: readonly (readonly [string, string])[];
  current: string;
  /** "You switched to Mapping." or the assistant's reason. */
  why?: ReactNode;
  /** The person's choice (`you`) or the assistant's (`assistant`). */
  source: 'you' | 'assistant';
  onSwitch: (path: string) => void;
}

/** The Path switch (WB-UI-02): the path and why, marked as the assistant's or the person's. */
export function PathSwitch({ paths, current, why, source, onSwitch }: PathSwitchProps) {
  return (
    <div className="sy-pathswitch">
      <span className="sy-label">Path</span>
      <div className="sy-seg" role="group" aria-label="Path">
        {paths.map(([key, word]) => (
          <button key={key} type="button" aria-pressed={current === key} onClick={() => onSwitch(key)}>
            {word}
          </button>
        ))}
      </div>
      {why && (
        <span className="sy-pathswitch__why" data-source={source}>
          {why}
        </span>
      )}
    </div>
  );
}

/** Suggested follow-ups (`.sy-suggest`): each sends itself as the next message. */
export function Suggestions({ items, onPick }: { items: readonly string[]; onPick: (text: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="sy-suggest" role="group" aria-label="Suggested follow-ups">
      {items.map((s) => (
        <button key={s} type="button" onClick={() => onPick(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}

/** The side sheet (WB-UI-07): the page a person selected, not generated; × or Esc closes it. */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <section className="sy-sheet" aria-label="Page details" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <header className="sy-sheet__head">
        <h2 className="sy-plate__title sy-case-normal" tabIndex={-1}>
          {title}
        </h2>
        <button className="sy-sheet__close" type="button" aria-label="Close page details (Esc)" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="sy-sheet__body">{children}</div>
    </section>
  );
}

/** The Workbench's layout (`.sy-wb--inline`): the conversation, and the side sheet when a page is open. */
export function WbLayout({ conversation, aside }: { conversation: ReactNode; aside?: ReactNode }) {
  return (
    <div className={aside ? 'sy-wb sy-wb--inline' : 'sy-wb sy-wb--inline sy-wb--nosheet'}>
      <section className="sy-plate sy-chat sy-wb__conv" aria-label="Conversation">
        {conversation}
      </section>
      {aside && (
        <aside className="sy-wb__aside" aria-label="Side sheet">
          {aside}
        </aside>
      )}
    </div>
  );
}
