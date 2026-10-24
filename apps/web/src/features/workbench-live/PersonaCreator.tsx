// Add a persona in place (spec 075 FR-009, R-95; the editable persona.add card, designer 19/04):
// the design system's CommandCard with the persona fields Settings and the beta Workbench share
// (`PersonaFields`). A new sign-in's login and password go to the vault through the credential
// route first (only to the chat service: never into the shared state, an action or the
// assistant's context); then Confirm sends the persona's names only.

import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Callout, CommandCard, Field, Input, Stack, Text } from '../../design-system';
import { argsOf, draftOf, NEW, PersonaFields, usePersonaForm, type PersonaArgs, type PersonaDraft } from '../../app/PersonaForm';
import { storeCredential } from '../../app/state/http';
import { useLiveFrame } from './context';
import type { LiveCommand } from './protocol';

interface Secret {
  login: string;
  password: string;
}

/** The credential a draft signs in with, when it is a new one (its values are asked here). */
const newCredential = (d: PersonaDraft): string | null => (d.signIn === NEW && d.newSignIn.trim() ? d.newSignIn.trim() : null);

function VaultFields({ credential, secret, onChange }: { credential: string; secret: Secret; onChange: (s: Secret) => void }) {
  return (
    <Stack>
      <Text small muted>{`${credential} is new: its login and password go to the vault only, never to the assistant.`}</Text>
      <Field label="Login">
        <Input value={secret.login} autoComplete="off" onChange={(e) => onChange({ ...secret, login: e.target.value })} />
      </Field>
      <Field label="Password">
        <Input type="password" value={secret.password} autoComplete="new-password" onChange={(e) => onChange({ ...secret, password: e.target.value })} />
      </Field>
    </Stack>
  );
}

export function PersonaCommand({
  card,
  onConfirm,
  onCancel,
  onUndo,
}: {
  card: LiveCommand;
  onConfirm: (args: Record<string, unknown>) => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  const { conversation, state } = useLiveFrame();
  const drafted = draftOf(card.args as PersonaArgs, card.signIns);
  const form = usePersonaForm(drafted, card.personas);
  const draft = useWatch({ control: form.control }) as PersonaDraft;
  // the sign-in's values stay out of the persona form (whose values are sent and kept): local, cleared after
  const [secret, setSecret] = useState<Secret>({ login: '', password: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const credential = newCredential(draft);
  const ready = form.formState.isValid && (credential === null || (secret.login !== '' && secret.password !== ''));
  const save = async () => {
    const where = state ? { portal: state.portal.id, environment: state.portal.environment } : null;
    const values = credential ? { [`${credential}_LOGIN`]: secret.login, [`${credential}_PASSWORD`]: secret.password } : null;
    const refused = where && values ? await storeCredential(`/chat/conversations/${encodeURIComponent(conversation)}/credentials`, where, values) : null;
    setSecret({ login: '', password: '' });
    if (refused !== null) return setProblem(`${refused} Nothing was added.`);
    onConfirm(argsOf(form.getValues()));
  };
  return (
    <CommandCard
      title={card.label}
      state={card.state}
      status={card.shown.shape ? { status: card.shown.shape, children: card.shown.word } : null}
      facts={card.facts}
      reason={card.reason}
      edit={{
        body: (
          <Stack>
            <PersonaFields form={form} signIns={card.signIns} drafted={drafted} />
            {credential !== null && <VaultFields credential={credential} secret={secret} onChange={setSecret} />}
            {problem && (
              <Callout tone="failure" live>
                {problem}
              </Callout>
            )}
          </Stack>
        ),
        ready,
      }}
      runningWord={card.running}
      result={card.result}
      error={card.error ?? ''}
      errorRef={card.errorRef}
      onConfirm={() => void save()}
      onCancel={onCancel}
      {...(card.undo ? { onUndo } : {})}
    />
  );
}
