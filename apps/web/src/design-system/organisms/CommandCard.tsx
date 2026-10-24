import { useId, useState, type ReactNode } from 'react';
import { Anchor } from '../atoms/Anchor.js';
import { Button } from '../atoms/Button.js';
import { Status, type StatusProps } from '../atoms/Status.js';
import { Facts } from '../molecules/Facts.js';

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
  /**
   * failed before anything existed (designer T-13, D-78: a scan start the crawler refused): the
   * status reads "Didn't start", the card says what was created (nothing) and quotes why; Start
   * again and Check the address (Settings ▸ Environments).
   */
  notStarted?: { onAgain?: () => void; check?: string };
  busy?: boolean;
  /** Confirm sends the card's one-time token (and the persona chosen); nothing runs before it. */
  onConfirm?: (persona: string | null) => void;
  onCancel?: () => void;
  /**
   * A card whose values the person owns (designer 19/04, `.sy-cmd__form`: persona.add): `body` is
   * its fields, the card's body is a form and Confirm its submit; `ready` false holds Confirm back.
   * The caller keeps the edited values and sends them from `onConfirm`.
   */
  edit?: { body: ReactNode; ready: boolean };
  /** done: Undo (persona.add removes the persona while no scan used it). */
  onUndo?: () => void;
  /** A Start card: "Add a persona…" after its persona list opens an Add-a-persona card (designer 19/04). */
  onAddPersona?: () => void;
}

/** A Start card's "As" choice (spec 044), or the way to add a persona when the portal has none. */
function PersonaChoice({ p, persona, setPersona }: { p: CommandCardProps; persona: string | null; setPersona: (x: string) => void }) {
  const add = p.onAddPersona && (
    <Button size="sm" variant="quiet" onClick={() => p.onAddPersona?.()}>
      Add a persona…
    </Button>
  );
  if (!p.personas?.length)
    return (
      <span className="sy-small">
        {'This portal has no persona yet. '}
        {add ?? (p.noPersona && <Anchor href={p.noPersona}>Add one in Settings</Anchor>)}
        {add ? '' : ', then ask again.'}
      </span>
    );
  return (
    <div className="sy-cluster">
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
      {add}
    </div>
  );
}

const proposedBy = (p: CommandCardProps) => (p.proposedBy === 'assistant' ? `Proposed by the assistant: ${p.reason ?? ''}` : 'You asked for it from the view.');

/** An editable card (designer 19/04): its fields are a form, Confirm submits what they show. */
function ProposedForm({ p, edit }: { p: CommandCardProps; edit: NonNullable<CommandCardProps['edit']> }) {
  const form = useId();
  const why = useId();
  const busy = p.busy === true;
  return (
    <>
      <form
        id={form}
        className="sy-cmd__body sy-cmd__form"
        aria-describedby={why}
        onSubmit={(e) => {
          e.preventDefault();
          if (edit.ready) p.onConfirm?.(null);
        }}
      >
        <span id={why} className="sy-cmd__wide sy-small sy-muted">
          {proposedBy(p)}
        </span>
        {p.facts && p.facts.length > 0 && (
          <div className="sy-cmd__wide">
            <Facts items={p.facts} />
          </div>
        )}
        <div className="sy-cmd__wide">{edit.body}</div>
      </form>
      <footer className="sy-cmd__foot">
        <Button size="sm" variant="primary" type="submit" form={form} busy={busy} disabled={!edit.ready}>
          Confirm
        </Button>
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => p.onCancel?.()}>
          Cancel
        </Button>
        <span className="sy-small sy-muted">Nothing is saved until you confirm.</span>
      </footer>
    </>
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
        <span className="sy-small sy-muted">{proposedBy(p)}</span>
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

/** done or undone: what happened, its links, and Undo where the command has one. */
function Done({ p }: { p: CommandCardProps }) {
  const undo = p.onUndo && p.state === 'done';
  const links = p.resultLinks ?? [];
  return (
    <>
      <div className="sy-cmd__body">
        <span>{p.result}</span>
      </div>
      {(links.length > 0 || undo) && (
        <footer className="sy-cmd__foot">
          {links.map(([label, href]) => (
            <Anchor key={href} href={href}>
              {label}
            </Anchor>
          ))}
          {undo && (
            <Button size="sm" variant="quiet" busy={p.busy === true} onClick={() => p.onUndo?.()}>
              Undo
            </Button>
          )}
        </footer>
      )}
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
  // the words say exactly what happened (designer T-13): not "Failed" when nothing started
  if (p.state === 'failed' && p.notStarted) return <Status status="failed">Didn&apos;t start</Status>;
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
      {p.state === 'proposed' && (p.edit ? <ProposedForm p={p} edit={p.edit} /> : <Proposed {...p} />)}
      {p.state === 'running' && (
        <div className="sy-cmd__body">
          <span className="sy-caret">{p.runningWord ?? 'Running'}</span>
        </div>
      )}
      {(p.state === 'done' || p.state === 'undone') && <Done p={p} />}
      {p.state === 'failed' && !p.notStarted && (
        <div className="sy-cmd__body" role="alert">
          <span>{`${p.error ?? ''} Nothing changed.`}</span> {p.errorRef}
        </div>
      )}
      {p.state === 'failed' && p.notStarted && <NotStarted p={p} n={p.notStarted} />}
    </section>
  );
}

/** A command that failed before it created anything (designer T-13): what was created, why, and the way on. */
function NotStarted({ p, n }: { p: CommandCardProps; n: NonNullable<CommandCardProps['notStarted']> }) {
  const why = (p.error ?? '').replace(/\.$/, '');
  return (
    <>
      <div className="sy-cmd__body" role="alert">
        <Facts
          items={[
            ['Created', 'nothing: no scan, no pages, nothing in Scans'],
            ['Why', `“${why}.”`],
            ...(p.errorRef ? [['Reference', p.errorRef] as const] : []),
          ]}
        />
        <span className="sy-small sy-muted">The crawler refused before it opened a page; nothing in the portal broke.</span>
      </div>
      <footer className="sy-cmd__foot">
        {n.onAgain && (
          <Button size="sm" onClick={n.onAgain}>
            Start again
          </Button>
        )}
        {n.check && (
          <Anchor className="sy-small" href={n.check}>
            Check the address
          </Anchor>
        )}
      </footer>
    </>
  );
}
