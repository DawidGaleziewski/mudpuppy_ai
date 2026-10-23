import { useState, type KeyboardEvent } from 'react';
import { Button, Callout, ChatLog, Chips, Cluster, Code, Composer, Confirm, Drawer, Field, Message, Segmented, Split, Stack, Tag, Text, Textarea } from '../design-system';
import { chatCall, useAssistant, useChatStream, type AssistantConversation, type AssistantPage, type PageContext } from './api-assistant';
import { Failure, Item, Live } from './AssistantParts';
import { QueryState } from './QueryState';

const SUGGESTIONS = ['Explain this page', 'What changed since the last scan?', 'Draft a to-be for this screen'];

function NotRunning({ hint }: { hint: string | null }) {
  return (
    <Callout tone="failure" title="Assistant not running">
      <Stack>
        <Text>Start it in a terminal, then open the drawer again. Every page keeps working.</Text>
        <Code label="Command that starts the chat service">{hint ?? ''}</Code>
      </Stack>
    </Callout>
  );
}

function Start({ page, onStarted }: { page: AssistantPage; onStarted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    const { status, answer } = await chatCall('/chat/conversations', { portal: page.portal });
    if (status < 300) onStarted();
    else setError(answer.message ?? 'No conversation was started.');
  };
  return (
    <ChatLog label="Conversation">
      <Text small>{`No conversation yet for ${page.portal}.`}</Text>
      {page.service_up ? (
        <Cluster>
          <Button variant="strong" onClick={() => void start()}>
            Start a conversation
          </Button>
        </Cluster>
      ) : (
        <NotRunning hint={page.start_hint} />
      )}
      {error && <Failure text={error} reference={null} />}
    </ChatLog>
  );
}

interface TurnProps {
  page: AssistantPage;
  conversation: AssistantConversation;
  context: PageContext | null;
  seeing: 'page' | 'portal';
}

/** A turn's actions: say something (with what the assistant can see), stop it, reset the assistant. */
function useTurn({ page, conversation, context, seeing }: TurnProps) {
  const stream = useChatStream(page.portal, conversation, page.service_up);
  const [text, setText] = useState('');
  const [mine, setMine] = useState<string | null>(null);
  const say = async (words: string) => {
    const message = words.trim();
    if (!message || stream.busy) return;
    stream.setBusy(true);
    setMine(message);
    setText('');
    const ctx = seeing === 'page' && context ? { kind: 'page', page: context } : { kind: 'portal' };
    const { status, answer } = await chatCall(conversation.send, { text: message, context: ctx });
    if (status === 202) return;
    setMine(null);
    setText(message);
    stream.add({ kind: 'error', text: answer.message ?? 'The message could not be sent.', ref: answer.ref ?? null });
    if (status !== 409) stream.setBusy(false);
  };
  const stop = async () => {
    const { status, answer } = await chatCall(conversation.cancel, {});
    if (status >= 300) stream.add({ kind: 'error', text: answer.message ?? 'The assistant could not be stopped.', ref: answer.ref ?? null });
  };
  const reset = async () => {
    const { status, answer } = await chatCall(conversation.reset, {});
    if (status >= 300) stream.add({ kind: 'error', text: answer.message ?? 'The assistant could not be reset.', ref: answer.ref ?? null });
    stream.refresh();
  };
  // The person's message until the stored history has it.
  const shown = mine && !page.items.some((i) => i.kind === 'user' && i.text === mine) ? mine : null;
  return { stream, text, setText, say, stop, reset, shown };
}

/** The conversation: its history, the turn streaming in, suggestions and the message box. */
function Conversation(props: TurnProps) {
  const { page, conversation } = props;
  const { stream, text, setText, say, stop, reset, shown } = useTurn(props);
  const [resetting, setResetting] = useState(false);
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void say(text);
    }
  };
  const off = !page.service_up || stream.busy;
  return (
    <>
      <ChatLog follow={`${String(page.items.length)}-${String(stream.live.length)}-${stream.live.at(-1)?.text.length ?? 0}`}>
        {page.items.length === 0 && (
          <Message who="Assistant">
            <Text block>Say what you want to do with this portal, or ask &quot;what can I do here?&quot;.</Text>
          </Message>
        )}
        {page.items.map((i) => (
          <Item key={i.id} item={i} conversation={conversation} onStored={stream.refresh} />
        ))}
        {shown && <Message mine>{shown}</Message>}
        {stream.live.map((l, i) => (
          <Live key={i} line={l} />
        ))}
        {stream.busy && (
          <Message who="Assistant">
            <Text muted>{stream.now || 'Thinking…'}</Text>
          </Message>
        )}
      </ChatLog>
      {!page.service_up && <NotRunning hint={page.start_hint} />}
      {page.service_up && (
        <Chips label="Suggestions">
          {SUGGESTIONS.map((s) => (
            <Button key={s} size="sm" variant="quiet" disabled={stream.busy} onClick={() => void say(s)}>
              {s}
            </Button>
          ))}
        </Chips>
      )}
      <Composer onSubmit={() => void say(text)}>
        <Field label="Message" help="Enter sends · Shift+Enter new line">
          <Textarea rows={2} value={text} disabled={off} placeholder="Ask about this page" onChange={(e) => setText(e.target.value)} onKeyDown={keys} />
        </Field>
        <Split>
          <Button size="sm" variant="quiet" disabled={off} onClick={() => setResetting(true)}>
            Reset the assistant
          </Button>
          <Cluster>
            {stream.busy && (
              <Button size="md" variant="danger" onClick={() => void stop()}>
                Stop
              </Button>
            )}
            <Button variant="strong" type="submit" disabled={off || !text.trim()}>
              Send
            </Button>
          </Cluster>
        </Split>
      </Composer>
      <Confirm open={resetting} title="Reset the assistant's context?" confirmLabel="Reset" onConfirm={() => {
          setResetting(false);
          void reset();
        }}
        onCancel={() => setResetting(false)}>
        The history stays on screen; the assistant starts its next answer afresh.
      </Confirm>
    </>
  );
}

/** What the assistant can see: this page (when the page names itself) or the whole yard. */
function Seeing({ portal, context, seeing, onSee }: { portal: string; context: PageContext | null; seeing: 'page' | 'portal'; onSee: (v: 'page' | 'portal') => void }) {
  if (!context) return <Text small>{`Whole yard · portal ${portal}`}</Text>;
  return (
    <Stack>
      <Segmented
        label="What the assistant can see"
        items={[
          { value: 'page', label: 'This page' },
          { value: 'portal', label: 'Whole yard' },
        ]}
        selected={seeing}
        onSelect={(v) => onSee(v === 'page' ? 'page' : 'portal')}
      />
      {seeing === 'page' ? (
        <Cluster>
          <Text small asIs>{`${context.type} · ${context.label ?? context.id}`}</Text>
          {context.rev !== undefined && <Tag size="sm">{`r${String(context.rev)}`}</Tag>}
          {(context.ids ?? []).map((i) => (
            <Tag key={i} size="sm">
              {i}
            </Tag>
          ))}
        </Cluster>
      ) : (
        <Text small>{`Portal · ${portal}`}</Text>
      )}
    </Stack>
  );
}

/** The assistant drawer on every portal page (screen 02, spec 022 M3): the portal's conversation. */
export function AssistantDrawer({ portal, context, onClose }: { portal: string; context: PageContext | null; onClose: () => void }) {
  const q = useAssistant(portal, true);
  // This page by default once the page names itself (its data may arrive after the drawer opens).
  const [picked, setSeeing] = useState<'page' | 'portal' | null>(null);
  const seeing = picked ?? (context ? 'page' : 'portal');
  return (
    <Drawer
      title="Assistant"
      onClose={onClose}
      actions={
        <Cluster>
          {q.data && (
            <Text small href={q.data.full_page}>
              Full page
            </Text>
          )}
          <Button size="sm" variant="quiet" onClick={onClose}>
            Close
          </Button>
        </Cluster>
      }
      context={<Seeing portal={portal} context={context} seeing={seeing} onSee={setSeeing} />}
    >
      <QueryState query={q} what="the conversation">
        {(page) =>
          page.conversation ? (
            <Conversation key={page.conversation.id} page={page} conversation={page.conversation} context={context} seeing={seeing} />
          ) : (
            <Start page={page} onStarted={() => void q.refetch()} />
          )
        }
      </QueryState>
    </Drawer>
  );
}
