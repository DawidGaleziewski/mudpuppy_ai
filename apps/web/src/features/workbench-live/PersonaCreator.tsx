// Add a persona in place (spec 075 FR-009, R-95; the editable persona.add card, designer 19/04):
// the design system's CommandCard with the persona fields Settings and the beta Workbench share
// (`PersonaFields`). A new sign-in's login and password go to the vault first, through the vault
// dialog (`VaultDialog`, spec 079 FR-009: only to the chat service, never into the shared state, an
// action or the assistant's context); then Confirm sends the persona's names only.

import { useWatch } from 'react-hook-form';
import { CommandCard, Stack } from '../../design-system';
import { argsOf, draftOf, newCredential, PersonaFields, usePersonaForm, type PersonaArgs, type PersonaDraft } from '../../app/PersonaForm';
import { credentialsPath, useNewSignIn } from '../../app/VaultDialog';
import { useLiveFrame } from './context';
import type { LiveCommand } from './protocol';

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
  const target = state ? { path: credentialsPath(conversation), portal: state.portal.id, environment: state.portal.environment } : null;
  const signIn = useNewSignIn(newCredential(draft), target);
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
            {signIn.part}
          </Stack>
        ),
        ready: form.formState.isValid && signIn.ready,
      }}
      runningWord={card.running}
      result={card.result}
      error={card.error ?? ''}
      errorRef={card.errorRef}
      onConfirm={() => onConfirm(argsOf(form.getValues()))}
      onCancel={onCancel}
      {...(card.undo ? { onUndo } : {})}
    />
  );
}
