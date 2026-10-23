import { useId, useState, type ReactNode } from 'react';
import { Anchor } from './Anchor.js';
import { Button } from './Button.js';
import { Facts } from './Facts.js';
import { Status, type StatusProps } from './Status.js';

export interface CommandCardProps {
  title: string;
  /** proposed · running · done · failed · cancelled · expired · undone. */
  state: string;
  /** The state as a status (cancelled and expired show a line instead). */
  status?: StatusProps | null;
  /** What it will do, in the designer's fixed order (Starts, From, Kept, Where, Undo). */
  facts?: readonly (readonly [string, string])[];
  reason?: string;
  /** Who proposed it: `assistant` (with its reason) or `button` (a button of the view). */
  proposedBy?: string;
  /** A Start card's "As" choice; none when the portal has no persona (then `noPersona` links to Settings). */
  personas?: readonly string[];
  persona?: string | null;
  askPersona?: boolean;
  noPersona?: string | null;
  /** running: "Resuming…". */
  runningWord?: string;
  /** done: what happened; expired: why it no longer applies; undone: what was taken back. */
  result?: string;
  resultLinks?: readonly (readonly [string, string])[];
  /** failed: the command's message and its error reference. */
  error?: string;
  errorRef?: ReactNode;
  busy?: boolean;
  /** Confirm sends the card's one-time token (and the persona chosen); nothing runs before it. */
  onConfirm?: (persona: string | null) => void;
  onCancel?: () => void;
}

/** A Start card's "As" choice (spec 044), or the way to add a persona when the portal has none. */
function PersonaChoice({ p, persona, setPersona }: { p: CommandCardProps; persona: string | null; setPersona: (x: string) => void }) {
  if (!p.personas?.length)
    return (
      <span className="sy-small">
        {'This portal has no persona yet. '}
        {p.noPersona && <Anchor href={p.noPersona}>Add one in Settings</Anchor>}, then ask again.
      </span>
    );
  return (
    <label className="sy-field">
      <span className="sy-field__label">As</span>
      <select className="sy-select" value={persona ?? ''} onChange={(e) => setPersona(e.target.value)}>
        {p.personas.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </label>
  );
}

function Proposed(p: CommandCardProps) {
  const [persona, setPersona] = useState(p.persona ?? p.personas?.[0] ?? null);
  const noPersona = Boolean(p.askPersona && !p.personas?.length);
  const busy = p.busy === true;
  return (
    <>
      <div className="sy-cmd__body">
        {p.facts && p.facts.length > 0 && <Facts items={p.facts} />}
        {p.askPersona && <PersonaChoice p={p} persona={persona} setPersona={setPersona} />}
        <span className="sy-small sy-muted">{p.proposedBy === 'assistant' ? `Proposed by the assistant: ${p.reason ?? ''}` : 'You asked for it from the view.'}</span>
      </div>
      <footer className="sy-cmd__foot">
        {!noPersona && (
          <Button size="sm" variant="primary" busy={busy} onClick={() => p.onConfirm?.(p.askPersona ? persona : null)}>
            Confirm
          </Button>
        )}
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => p.onCancel?.()}>
          Cancel
        </Button>
        <span className="sy-small sy-muted">Nothing runs until you confirm.</span>
      </footer>
    </>
  );
}

/**
 * A command card (designer § 5.12): every write the assistant proposes asks first. Confirm is the
 * one marker button on screen; nothing is sent before it. Seven states, each in words.
 */
function Head({ p }: { p: CommandCardProps }) {
  if (p.state === 'cancelled') return <span className="sy-small sy-muted">Cancelled · nothing changed</span>;
  if (p.state === 'expired') return <span className="sy-small sy-muted">{`No longer applies: ${p.result ?? ''}`}</span>;
  return p.status ? <Status {...p.status} /> : null;
}

export function CommandCard(p: CommandCardProps) {
  const title = useId();
  const head = <Head p={p} />;
  return (
    <section className="sy-cmd" data-cmd-state={p.state} aria-labelledby={title}>
      <header className="sy-cmd__head">
        <span id={title} className="sy-cmd__title" tabIndex={-1}>
          {p.title}
        </span>
        {head}
      </header>
      {p.state === 'proposed' && <Proposed {...p} />}
      {p.state === 'running' && (
        <div className="sy-cmd__body">
          <span className="sy-caret">{p.runningWord ?? 'Running'}</span>
        </div>
      )}
      {(p.state === 'done' || p.state === 'undone') && (
        <>
          <div className="sy-cmd__body">
            <span>{p.result}</span>
          </div>
          {p.resultLinks && p.resultLinks.length > 0 && (
            <footer className="sy-cmd__foot">
              {p.resultLinks.map(([label, href]) => (
                <Anchor key={href} href={href}>
                  {label}
                </Anchor>
              ))}
            </footer>
          )}
        </>
      )}
      {p.state === 'failed' && (
        <div className="sy-cmd__body" role="alert">
          <span>{`${p.error ?? ''} Nothing changed.`}</span> {p.errorRef}
        </div>
      )}
    </section>
  );
}
