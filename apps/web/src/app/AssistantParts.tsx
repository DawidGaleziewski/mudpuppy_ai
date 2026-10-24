import { useState } from 'react';
import { Button, ChatDivider, Cluster, Confirm, Field, Input, Message, ProposalCard, ScanId, Stack, Tag, Text, Vault } from '../design-system';
import type { AssistantConversation, AssistantItem, AssistantPage, LiveLine } from './api-assistant';
import { storeCredential } from './state/http';
import { ShownStatus } from './ShownStatus';

/** A failure with its ERR reference, which the error page looks up. */
export function Failure({ text, reference }: { text: string; reference: string | null | undefined }) {
  return (
    <Message who="System">
      <Text block>{text}</Text>
      {reference && (
        <Cluster>
          <Text small muted>
            reference
          </Text>
          <Text mono small href={`/app/errors/${encodeURIComponent(reference)}`}>
            {reference}
          </Text>
        </Cluster>
      )}
    </Message>
  );
}

/** A credential the assistant asked for: one vault field for its name; the value is sent once, never shown. */
function CredentialCard({ item, conversation, onStored }: { item: AssistantItem; conversation: AssistantConversation; onStored: () => void }) {
  const c = item.credential;
  const [value, setValue] = useState('');
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  if (!c) return null;
  const label = `Credential · ${c.environment} · ${c.persona}`;
  const store = async () => {
    setAsking(false);
    const refused = await storeCredential(conversation.credentials, { portal: c.portal, environment: c.environment }, { [c.ref]: value });
    setValue('');
    if (refused === null) onStored();
    setResult(refused ?? `${c.ref} is in the vault. The value is not shown again.`);
  };
  return (
    <Message who="Assistant">
      {c.reason && <Text block>{c.reason}</Text>}
      <Vault label={label}>
        <Cluster>
          <Text small strong>
            {label}
          </Text>
          <ShownStatus status={c.status} />
        </Cluster>
        {c.stored ? (
          <Text small>{`${c.ref} is in the vault. The value is not shown again.`}</Text>
        ) : (
          <Stack>
            <Field label={`Value of ${c.ref}`} help="Values go into the vault, never into the chat, and are not shown again.">
              <Input type="password" autoComplete="new-password" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
            <Cluster>
              <Button size="sm" variant="strong" disabled={!value} onClick={() => setAsking(true)}>
                Store in vault
              </Button>
            </Cluster>
            {result && (
              <Text small block>
                {result}
              </Text>
            )}
          </Stack>
        )}
      </Vault>
      <Confirm open={asking} title={`Store ${c.ref} in the vault?`} confirmLabel="Store in vault" onConfirm={() => void store()} onCancel={() => setAsking(false)}>
        {`For ${c.portal} · ${c.environment}. The value goes to the vault only and is not shown again.`}
      </Confirm>
    </Message>
  );
}

function ProposalItem({ item }: { item: AssistantItem }) {
  const p = item.proposal;
  if (!p) return null;
  return (
    <Message who="Assistant">
      <ProposalCard
        title={p.key ? 'Proposed change' : 'Proposed amendment'}
        aside={
          <Cluster>
            {p.key && <Tag size="sm">{p.key}</Tag>}
            <ShownStatus status={p.status} />
          </Cluster>
        }
        foot={
          <Text small href={p.href}>
            Apply or discard it in Review
          </Text>
        }
      >
        <Text>{p.summary}</Text>
        {p.target && (
          <Text mono small drawn>
            {p.target}
          </Text>
        )}
        {p.text && <Text drawn>{p.text}</Text>}
      </ProposalCard>
    </Message>
  );
}

/** One stored item of the conversation. */
export function Item({ item, conversation, onStored }: { item: AssistantItem; conversation: AssistantConversation; onStored: () => void }) {
  switch (item.kind) {
    case 'user':
      return <Message mine>{item.text}</Message>;
    case 'assistant':
      return (
        <Message who="Assistant">
          <Text block>{item.text}</Text>
        </Message>
      );
    case 'error':
      return <Failure text={item.text} reference={item.ref} />;
    case 'credential':
      return <CredentialCard item={item} conversation={conversation} onStored={onStored} />;
    case 'proposal':
      return <ProposalItem item={item} />;
    default:
      return <ChatDivider>{`${item.text} · ${item.at}`}</ChatDivider>;
  }
}

/**
 * The conversation's run in one line (FE-C02; one grammar, designer 19/12): status · AI scan or
 * Check run · its 13-character id · progress · where or when · Open.
 */
export function ScanLine({ scan }: { scan: NonNullable<AssistantPage['scan']> }) {
  return (
    <Cluster>
      <ShownStatus status={scan.status} />
      <Text small>{scan.kind}</Text>
      <ScanId id={scan.scan} />
      <Text small>{scan.progress}</Text>
      {scan.last && (
        <Text small muted={scan.last_muted}>
          {scan.last}
        </Text>
      )}
      <Text small href={scan.href}>
        Open
      </Text>
    </Cluster>
  );
}

/** A line of the turn in progress: the streamed reply, a notice, a failure. */
export function Live({ line }: { line: LiveLine }) {
  if (line.kind === 'error') return <Failure text={line.text} reference={line.ref} />;
  if (line.kind === 'notice') return <ChatDivider>{line.text}</ChatDivider>;
  return (
    <Message who="Assistant">
      <Text block>{line.text}</Text>
    </Message>
  );
}
