// Add a persona in place (spec 075 FR-009, R-95; the editable persona.add card, designer 19/04):
// the person fills in the persona; a sign-in's login and password go to the vault through the
// credential route first (only to the chat service: never into the shared state, an action or the
// assistant's context), then Save confirms the card with the names only.

import { useState, type FormEvent } from 'react';
import { useLiveFrame } from './context';
import type { LiveCommand } from './protocol';

const NAME = /^[a-z][a-z0-9-]{1,23}$/;
const CREDENTIAL = /^[A-Z][A-Z0-9_]{1,47}$/;

interface Draft {
  name: string;
  about: string;
  signsIn: boolean;
  credential: string;
  login: string;
  password: string;
  label: string;
  value: string;
}

const draftOf = (card: LiveCommand): Draft => ({
  name: typeof card.args.name === 'string' ? card.args.name : '',
  about: typeof card.args.about === 'string' ? card.args.about : '',
  signsIn: typeof card.args.credential === 'string',
  credential: typeof card.args.credential === 'string' ? card.args.credential : '',
  login: '',
  password: '',
  label: '',
  value: '',
});

/** The card's args as Confirm sends them: names only. */
export function personaArgs(d: Draft): Record<string, unknown> {
  return {
    name: d.name,
    ...(d.about ? { about: d.about } : {}),
    ...(d.signsIn && d.credential ? { credential: d.credential } : {}),
    ...(d.label && d.value ? { test_data: [{ field: { label: d.label }, value: d.value }] } : {}),
  };
}

function problemOf(d: Draft, card: LiveCommand): string | null {
  if (!NAME.test(d.name)) return 'The name is lower case, 2–24 letters, digits or dashes.';
  if (d.signsIn && !CREDENTIAL.test(d.credential)) return 'The credential name is in capitals: KLIENT, AGENT_ANNA.';
  const known = card.signIns.includes(d.credential);
  if (d.signsIn && !known && !(d.login && d.password)) return 'A new credential needs its login and password (they go to the vault).';
  return null;
}

async function storeSignIn(conversation: string, portal: string, environment: string, d: Draft): Promise<string | null> {
  const r = await fetch(`/chat/conversations/${encodeURIComponent(conversation)}/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ portal, environment, values: { [`${d.credential}_LOGIN`]: d.login, [`${d.credential}_PASSWORD`]: d.password } }),
  });
  if (r.ok) return null;
  const body = (await r.json().catch(() => ({}))) as { message?: string };
  return body.message ?? `The vault did not take it (${String(r.status)}).`;
}

function Field({ label, value, onChange, type = 'text', help }: { label: string; value: string; onChange: (v: string) => void; type?: string; help?: string }) {
  return (
    <label className="wbx-field">
      <span>{label}</span>
      <input type={type} value={value} autoComplete={type === 'password' ? 'new-password' : 'off'} onChange={(e) => onChange(e.target.value)} />
      {help && <small className="wbx-muted">{help}</small>}
    </label>
  );
}

export function PersonaCreator({ card, onConfirm, onCancel }: { card: LiveCommand; onConfirm: (args: Record<string, unknown>) => void; onCancel: () => void }) {
  const { conversation, state } = useLiveFrame();
  const [d, setD] = useState<Draft>(() => draftOf(card));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Draft) => (v: string | boolean) => setD((x) => ({ ...x, [k]: v }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const why = problemOf(d, card);
    if (why) return setProblem(why);
    setSaving(true);
    const vault = d.signsIn && d.login && d.password && state ? await storeSignIn(conversation, state.portal.id, state.portal.environment, d) : null;
    setD((x) => ({ ...x, login: '', password: '' }));
    setSaving(false);
    if (vault !== null) return setProblem(`${vault} Nothing was added.`);
    onConfirm(personaArgs(d));
  };
  return (
    <form className="wbx-persona" onSubmit={(e) => void save(e)} aria-label="Add a persona">
      <Field label="Name" value={d.name} onChange={set('name')} help="lower case: agent-anna" />
      <Field label="About" value={d.about} onChange={set('about')} />
      <label className="wbx-field wbx-field--check">
        <input type="checkbox" checked={d.signsIn} onChange={(e) => set('signsIn')(e.target.checked)} /> Signs in
      </label>
      {d.signsIn && (
        <>
          <Field label="Credential name" value={d.credential} onChange={set('credential')} help={card.signIns.length ? `known: ${card.signIns.join(', ')}` : 'a new one: its values go to the vault'} />
          {!card.signIns.includes(d.credential) && (
            <>
              <Field label="Login" value={d.login} onChange={set('login')} help="to the vault only" />
              <Field label="Password" type="password" value={d.password} onChange={set('password')} help="to the vault only" />
            </>
          )}
        </>
      )}
      <Field label="Test data: field label" value={d.label} onChange={set('label')} />
      <Field label="Test data: value (synthetic)" value={d.value} onChange={set('value')} />
      {problem && <p role="alert" className="wbx-error">{problem}</p>}
      <div className="wbx-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save persona'}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
