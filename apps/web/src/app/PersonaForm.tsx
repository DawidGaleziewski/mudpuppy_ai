// The fields of a new persona (spec 072 FR-004; designer 19/04, `persona.add`), shared by
// Settings ▸ Personas (Add persona) and the Workbench's editable command card. A persona signs in
// with a credential named in the vault (X: the pair X_LOGIN / X_PASSWORD), never with a value;
// test data are label → value, test values only.
import { useState } from 'react';
import { Button, Cluster, Field, Input, Select, Stack, Table, Text } from '../design-system';

export interface PersonaRow {
  label: string;
  value: string;
}

export interface PersonaDraft {
  name: string;
  about: string;
  /** '' browses as a guest; a credential name; NEW: a name typed in `newSignIn`. */
  signIn: string;
  newSignIn: string;
  rows: PersonaRow[];
}

/** `persona.add`'s args as the contract has them. */
export interface PersonaArgs {
  name: string;
  about?: string;
  credential?: string;
  test_data?: { field: { label: string; route?: string; state?: number }; value: string }[];
}

export const NEW = '__new';
const NAME = /^[a-z][a-z0-9-]{1,23}$/;
const CREDENTIAL = /^[A-Z][A-Z0-9_]{1,47}$/;
const MAX_ROWS = 20;

export const emptyDraft: PersonaDraft = { name: '', about: '', signIn: '', newSignIn: '', rows: [] };

/** A draft from the args the assistant proposed (a credential not offered is shown as typed). */
export function draftOf(args: PersonaArgs, signIns: readonly string[]): PersonaDraft {
  const credential = args.credential ?? '';
  const known = credential === '' || signIns.includes(credential);
  return {
    name: args.name,
    about: args.about ?? '',
    signIn: known ? credential : NEW,
    newSignIn: known ? '' : credential,
    rows: (args.test_data ?? []).map((t) => ({ label: t.field.label, value: t.value })),
  };
}

export function argsOf(d: PersonaDraft): PersonaArgs {
  const credential = d.signIn === NEW ? d.newSignIn.trim() : d.signIn;
  const rows = d.rows.filter((r) => r.label.trim() !== '');
  return {
    name: d.name.trim(),
    ...(d.about.trim() ? { about: d.about.trim() } : {}),
    ...(credential ? { credential } : {}),
    ...(rows.length ? { test_data: rows.map((r) => ({ field: { label: r.label.trim() }, value: r.value })) } : {}),
  };
}

/** What stops the draft from being sent, field by field (the server checks again). */
export function problemsOf(d: PersonaDraft, taken: readonly string[]): Partial<Record<'name' | 'signIn', string>> {
  const out: Partial<Record<'name' | 'signIn', string>> = {};
  if (!NAME.test(d.name.trim())) out.name = 'Lower case letters, digits and dashes, 2–24, starting with a letter.';
  else if (taken.includes(d.name.trim())) out.name = `${d.name.trim()} is already a persona of this portal.`;
  if (d.signIn === NEW && !CREDENTIAL.test(d.newSignIn.trim())) out.signIn = 'Capital letters, digits and underscores, like SHOP_CLIENT.';
  return out;
}

export interface PersonaFieldsProps {
  draft: PersonaDraft;
  onChange: (d: PersonaDraft) => void;
  /** Credential names a persona can sign in with (Settings' `sign_ins`). */
  signIns: readonly string[];
  /** The personas the portal has, so a taken name is said before sending. */
  taken: readonly string[];
  /** What the assistant drafted: a field that differs is marked as the person's (designer 19/04). */
  drafted?: PersonaDraft;
}

const changed = (now: string, was: string | undefined) => was !== undefined && now !== was;
const wasHelp = (was: string | undefined, help: string) => (was === undefined ? help : `Changed by you (was “${was || 'empty'}”).`);

/** The persona's fields: name, who this is, how it signs in, test data for forms. */
export function PersonaFields({ draft, onChange, signIns, taken, drafted }: PersonaFieldsProps) {
  const set = (patch: Partial<PersonaDraft>) => onChange({ ...draft, ...patch });
  const problems = problemsOf(draft, taken);
  const nameEdited = changed(draft.name, drafted?.name);
  const signInEdited = changed(draft.signIn + draft.newSignIn, drafted && drafted.signIn + drafted.newSignIn);
  return (
    <Stack>
      <Field label="Name" edited={nameEdited} help={nameEdited ? wasHelp(drafted?.name, '') : 'Lower case, used in scans and filters.'} {...(draft.name && problems.name ? { error: problems.name } : {})}>
        <Input value={draft.name} maxLength={24} required onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Who this is" edited={changed(draft.about, drafted?.about)} help={changed(draft.about, drafted?.about) ? wasHelp(drafted?.about, '') : 'Plain words, up to 140 characters.'}>
        <Input value={draft.about} maxLength={140} onChange={(e) => set({ about: e.target.value })} />
      </Field>
      <Field label="Signs in with" edited={signInEdited} help="A credential named in the vault, never its value: X stands for X_LOGIN and X_PASSWORD." {...(problems.signIn ? { error: problems.signIn } : {})}>
        <Select value={draft.signIn} onChange={(e) => set({ signIn: e.target.value })}>
          <option value="">Nothing: browses as a guest</option>
          {signIns.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={NEW}>Another credential name…</option>
        </Select>
      </Field>
      {draft.signIn === NEW && (
        <Field label="Credential name" help="Store its values in Settings ▸ Credentials or when the assistant asks; the persona names it only.">
          <Input value={draft.newSignIn} maxLength={48} onChange={(e) => set({ newSignIn: e.target.value.toUpperCase() })} />
        </Field>
      )}
      <TestData rows={draft.rows} onChange={(rows) => set({ rows })} />
    </Stack>
  );
}

function TestData({ rows, onChange }: { rows: PersonaRow[]; onChange: (rows: PersonaRow[]) => void }) {
  const put = (i: number, patch: Partial<PersonaRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Stack>
      {rows.length > 0 && (
        <Table
          caption="Test data for forms"
          columns={[
            { header: 'Field, as the form shows it', rowHeader: true, cell: (r: PersonaRow & { i: number }) => <Input aria-label={`Field ${String(r.i + 1)}`} value={r.label} maxLength={200} onChange={(e) => put(r.i, { label: e.target.value })} /> },
            { header: 'Value', cell: (r: PersonaRow & { i: number }) => <Input aria-label={`Value for ${r.label || `field ${String(r.i + 1)}`}`} value={r.value} maxLength={200} onChange={(e) => put(r.i, { value: e.target.value })} /> },
            { header: '', cell: (r: PersonaRow & { i: number }) => <Button size="sm" variant="quiet" aria-label={`Remove ${r.label || `row ${String(r.i + 1)}`}`} onClick={() => onChange(rows.filter((_, j) => j !== r.i))}>Remove</Button> },
          ]}
          rows={rows.map((r, i) => ({ ...r, i }))}
          rowKey={(r) => String(r.i)}
          dense
        />
      )}
      <Cluster>
        <Button size="sm" variant="quiet" disabled={rows.length >= MAX_ROWS} onClick={() => onChange([...rows, { label: '', value: '' }])}>
          Add a value
        </Button>
        <Text small muted>Test values only, never a real customer’s.</Text>
      </Cluster>
    </Stack>
  );
}

/** A draft and its setter, starting from `initial`. */
export const usePersonaDraft = (initial: PersonaDraft) => useState<PersonaDraft>(initial);
