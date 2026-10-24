// The fields of a new persona (spec 072 FR-004; designer 19/04, `persona.add`), shared by
// Settings ▸ Personas (Add persona), the beta Workbench's editable command card and the live
// Workbench's: one React Hook Form (`usePersonaForm`, spec 076) with the draft's rules as a zod
// schema. A persona signs in with a credential named in the vault (X: the pair X_LOGIN /
// X_PASSWORD), never with a value; test data are label → value, test values only.
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
export type PersonaArgs = {
  name: string;
  about?: string;
  credential?: string;
  test_data?: { field: { label: string; route?: string; state?: number }; value: string }[];
};

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

/** The draft's rules (the server checks again): a free name in the persona pattern, a credential name in its own. */
export const personaSchema = (taken: readonly string[]) =>
  z
    .object({
      name: z
        .string()
        .refine((n) => NAME.test(n.trim()), 'Lower case letters, digits and dashes, 2–24, starting with a letter.')
        .refine((n) => !taken.includes(n.trim()), (n) => ({ message: `${n.trim()} is already a persona of this portal.` })),
      about: z.string().max(140),
      signIn: z.string(),
      newSignIn: z.string(),
      rows: z.array(z.object({ label: z.string().max(200), value: z.string().max(200) })).max(MAX_ROWS),
    })
    .superRefine((d, ctx) => {
      if (d.signIn === NEW && !CREDENTIAL.test(d.newSignIn.trim()))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['signIn'], message: 'Capital letters, digits and underscores, like SHOP_CLIENT.' });
    });

/** The persona form: starts at `initial`, checked as it is typed; `formState.isValid` is "ready". */
export const usePersonaForm = (initial: PersonaDraft, taken: readonly string[]) =>
  useForm<PersonaDraft>({ defaultValues: initial, resolver: zodResolver(personaSchema(taken)), mode: 'onChange' });

export interface PersonaFieldsProps {
  form: UseFormReturn<PersonaDraft>;
  /** Credential names a persona can sign in with (Settings' `sign_ins`). */
  signIns: readonly string[];
  /** What the assistant drafted: a field that differs is marked as the person's (designer 19/04). */
  drafted?: PersonaDraft;
}

const changed = (now: string, was: string | undefined) => was !== undefined && now !== was;
const wasHelp = (was: string | undefined, help: string) => (was === undefined ? help : `Changed by you (was “${was || 'empty'}”).`);

/** The persona's fields: name, who this is, how it signs in, test data for forms. */
export function PersonaFields({ form, signIns, drafted }: PersonaFieldsProps) {
  const draft = useWatch({ control: form.control }) as PersonaDraft;
  const errors = form.formState.errors;
  const nameEdited = changed(draft.name, drafted?.name);
  const signInEdited = changed(draft.signIn + draft.newSignIn, drafted && drafted.signIn + drafted.newSignIn);
  const upper = form.register('newSignIn', {
    onChange: (e: { target: { value: string } }) => form.setValue('newSignIn', e.target.value.toUpperCase(), { shouldValidate: true }),
  });
  return (
    <Stack>
      <Field label="Name" edited={nameEdited} help={nameEdited ? wasHelp(drafted?.name, '') : 'Lower case, used in scans and filters.'} {...(draft.name && errors.name?.message ? { error: errors.name.message } : {})}>
        <Input maxLength={24} required {...form.register('name')} />
      </Field>
      <Field label="Who this is" edited={changed(draft.about, drafted?.about)} help={changed(draft.about, drafted?.about) ? wasHelp(drafted?.about, '') : 'Plain words, up to 140 characters.'}>
        <Input maxLength={140} {...form.register('about')} />
      </Field>
      <Field label="Signs in with" edited={signInEdited} help="A credential named in the vault, never its value: X stands for X_LOGIN and X_PASSWORD." {...(errors.signIn?.message ? { error: errors.signIn.message } : {})}>
        <Select {...form.register('signIn', { deps: ['newSignIn'] })}>
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
          <Input maxLength={48} {...upper} />
        </Field>
      )}
      <TestData form={form} />
    </Stack>
  );
}

/** The test data for forms: a row per field label, added and removed in place (`useFieldArray`). */
function TestData({ form }: { form: UseFormReturn<PersonaDraft> }) {
  const rows = useFieldArray({ control: form.control, name: 'rows' });
  const labels = useWatch({ control: form.control, name: 'rows' });
  return (
    <Stack>
      {rows.fields.length > 0 && (
        <Table
          caption="Test data for forms"
          columns={[
            { header: 'Field, as the form shows it', rowHeader: true, cell: (r: { i: number }) => <Input aria-label={`Field ${String(r.i + 1)}`} maxLength={200} {...form.register(`rows.${r.i}.label`)} /> },
            { header: 'Value', cell: (r: { i: number }) => <Input aria-label={`Value for ${labels[r.i]?.label || `field ${String(r.i + 1)}`}`} maxLength={200} {...form.register(`rows.${r.i}.value`)} /> },
            { header: '', cell: (r: { i: number }) => <Button size="sm" variant="quiet" aria-label={`Remove ${labels[r.i]?.label || `row ${String(r.i + 1)}`}`} onClick={() => rows.remove(r.i)}>Remove</Button> },
          ]}
          rows={rows.fields.map((f, i) => ({ id: f.id, i }))}
          rowKey={(r) => r.id}
          dense
        />
      )}
      <Cluster>
        <Button size="sm" variant="quiet" disabled={rows.fields.length >= MAX_ROWS} onClick={() => rows.append({ label: '', value: '' })}>
          Add a value
        </Button>
        <Text small muted>Test values only, never a real customer’s.</Text>
      </Cluster>
    </Stack>
  );
}
