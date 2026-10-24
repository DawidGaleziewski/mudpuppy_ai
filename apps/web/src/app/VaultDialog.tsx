// Store a new credential… (designer 19/04, R-102 (5), spec 079 FR-009): the vault form as a dialog
// from the persona card, in the beta and the live Workbench alike. The login and password go to the
// vault through the conversation's credential route only (never into a card's args, the shared
// state, an action or the assistant's context) and are cleared from the page at once.
import { useState } from 'react';
import { Button, Callout, Cluster, Dialog, Field, Input, Split, Stack, SubHead, Text } from '../design-system';
import { storeCredential } from './state/http';

export interface VaultTarget {
  /** The conversation's credential route, `/chat/conversations/{c}/credentials`. */
  path: string;
  portal: string;
  environment: string;
}

export const credentialsPath = (conversation: string) => `/chat/conversations/${encodeURIComponent(conversation)}/credentials`;

export function VaultDialog({ credential, target, onStored, onClose }: { credential: string; target: VaultTarget; onStored: () => void; onClose: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const store = async () => {
    setBusy(true);
    const refused = await storeCredential(target.path, { portal: target.portal, environment: target.environment }, { [`${credential}_LOGIN`]: login, [`${credential}_PASSWORD`]: password });
    setBusy(false);
    setLogin('');
    setPassword('');
    if (refused !== null) return setProblem(refused);
    onStored();
    onClose();
  };
  return (
    <Dialog open onClose={onClose} label={`Store ${credential} in the vault`}>
      <Dialog.Head>
        <Split>
          <SubHead section>{`Store ${credential} in the vault`}</SubHead>
          <Dialog.Close />
        </Split>
      </Dialog.Head>
      <Dialog.Body>
        <Stack>
          <Text small muted>{`For ${target.portal} on ${target.environment}. The values go to the vault only: never to the card, the chat or the assistant, and they are not shown again.`}</Text>
          <Field label="Login">
            <Input value={login} autoComplete="off" onChange={(e) => setLogin(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {problem && (
            <Callout tone="failure" live>
              {`${problem} Nothing was stored.`}
            </Callout>
          )}
        </Stack>
      </Dialog.Body>
      <Dialog.Foot>
        <Cluster>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!login || !password} busy={busy} onClick={() => void store()}>
            Store in the vault
          </Button>
        </Cluster>
      </Dialog.Foot>
    </Dialog>
  );
}

/**
 * The persona card's new sign-in (`credential` when the draft names a new one): a button that opens
 * the vault dialog, and whether its values are stored, which Confirm waits for.
 */
export function useNewSignIn(credential: string | null, target: VaultTarget | null) {
  const [stored, setStored] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const done = credential !== null && stored === credential;
  const part =
    credential === null ? null : (
      <Stack>
        {done ? (
          <Text small>{`${credential} is in the vault.`}</Text>
        ) : (
          <Cluster>
            <Button size="sm" disabled={target === null} onClick={() => setOpen(true)}>{`Store ${credential} in the vault…`}</Button>
            <Text small muted>{target === null ? 'Send a message first: the vault needs the conversation.' : 'Its values are asked in a dialog, never in the card.'}</Text>
          </Cluster>
        )}
        {open && target && <VaultDialog credential={credential} target={target} onStored={() => setStored(credential)} onClose={() => setOpen(false)} />}
      </Stack>
    );
  return { ready: credential === null || done, part };
}
