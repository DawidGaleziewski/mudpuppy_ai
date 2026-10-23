import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button, Callout, ChatLog, Composer, Disclosure, Field, LiveBar, Message, PageHead, PathSwitch, Row, Rows, Split, Stack, Suggestions, Text, Textarea, WbLayout, shortScanId } from '../design-system';
import { useWrite } from '../app/api-write';
import { useWbStream, useWorkbench, wbWrites, workbenchHref, workbenchKey, type WbPageModel, type WbTurn } from '../app/api-workbench';
import { QueryState } from '../app/QueryState';
import { useGo } from '../app/RouterAnchor';
import { Shell } from '../app/Shell';
import { Card, Command, PageSheet, TurnNarration, type WbActions } from './WorkbenchCards';

function Turn({ rt, a, last, streaming }: { rt: WbTurn; a: WbActions; last: boolean; streaming: string }) {
  const t = rt.turn;
  // the newest turn shows the answer as it streams until the store has it
  const live = last && streaming ? streaming.split('\n\n') : [];
  const answer = t.answer.length ? t.answer : live;
  return (
    <>
      {t.is_event ? <Text small muted>You confirmed a command; the assistant starts it.</Text> : <Message mine>{t.asked}</Message>}
      <Message who="Assistant">
        <Stack>
          {answer.map((p, i) => (
            <Text key={i} block>{p}</Text>
          ))}
          {t.notices.map((n) => (
            <Text key={n} small muted>{n}</Text>
          ))}
          {rt.cards.map((card) => (
            <Card key={card.frame.dom_id} card={card} view={t.view?.id ?? null} a={a} />
          ))}
          <Suggestions items={rt.suggestions} onPick={a.ask} />
          {rt.commands.map((c) => (
            <Command key={c.dom_id} c={c} a={a} />
          ))}
        </Stack>
      </Message>
      {rt.narration.length > 0 && (
        <Message who="Assistant · narrating">
          <TurnNarration rt={rt} a={a} />
        </Message>
      )}
    </>
  );
}

function Conversation({ m, a, text, setText, send, streaming }: { m: WbPageModel; a: WbActions; text: string; setText: (t: string) => void; send: () => void; streaming: string }) {
  const blocked = m.blocked ?? null;
  return (
    <>
      {m.live && m.live_card && <LiveBar href={`#${m.live_card}`}>{`Scan ${shortScanId(m.live.run_id)} · ${String(m.live.steps)} steps · now at ${m.live.here?.route ?? '—'}`}</LiveBar>}
      <ChatLog label="Conversation" follow={`${String(m.turns.length)}-${streaming.length}`}>
        {m.turns.length === 0 && (
          <Stack>
            <Text strong>Nothing composed yet</Text>
            <Text small>Ask about the portal, or ask the assistant to map it.</Text>
            <Suggestions items={m.starters} onPick={a.ask} />
          </Stack>
        )}
        {m.turns.map((rt, i) => (
          <Turn key={rt.turn.n} rt={rt} a={a} last={i === m.turns.length - 1} streaming={streaming} />
        ))}
      </ChatLog>
      <Composer onSubmit={send} label="Write to the Workbench">
        <Field label="Message">
          <Textarea
            rows={2}
            placeholder="Ask, or tell the crawler what to do"
            value={text}
            disabled={blocked !== null}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
        </Field>
        <Split>
          <Text small muted>{blocked ?? 'Enter sends · Shift Enter a new line'}</Text>
          <Button type="submit" variant="strong" disabled={blocked !== null || !text.trim()}>Send</Button>
        </Split>
      </Composer>
    </>
  );
}

function Recent({ m, portal }: { m: WbPageModel; portal: string }) {
  if (!m.recent.length) return null;
  return (
    <Disclosure summary={`Recent conversations (${String(m.recent.length)})`}>
      <Stack>
        <Rows label="Recent conversations">
          {m.recent.map(([conv, first]) => (
            <Row key={conv.id} current={conv.id === m.conversation?.id} aside={<Text small muted>{conv.created_at}</Text>}>
              <Text href={workbenchHref(portal, { c: conv.id })}>{conv.title ?? (first || 'Untitled')}</Text>
            </Row>
          ))}
        </Rows>
        <Text small href={workbenchHref(portal, { new: true })}>New conversation</Text>
      </Stack>
    </Disclosure>
  );
}

function Body({ m, portal }: { m: WbPageModel; portal: string }) {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(m.ask);
  const go = useGo();
  const write = useWrite(workbenchKey(portal));
  const conv = m.conversation?.id ?? null;
  const streaming = useWbStream(portal, conv);
  const post = (w: Parameters<typeof write.mutate>[0], then?: (href: string | null) => void) =>
    write.mutate(w, { onSuccess: (r) => r.ok && then?.(r.href) });
  const a: WbActions = {
    model: m,
    sel: params.get('sel'),
    select: (sel) =>
      setParams((p) => {
        p.set('sel', sel);
        return p;
      }),
    ask: setText,
    open: (turn, command, scan) => conv && post(wbWrites.open(conv, turn, command, scan)),
    switchPath: (path) => conv && post(wbWrites.path(conv, path)),
    feedback: (view, answer) => post(wbWrites.feedback(view, answer)),
    confirm: (id, token, persona) => post(wbWrites.confirm(id, token, persona)),
    cancel: (id) => post(wbWrites.cancel(id)),
  };
  const send = () => {
    const t = text.trim();
    if (!t) return;
    post(wbWrites.send(portal, conv, t), (href) => {
      setText('');
      if (!conv && href) go(href);
    });
  };
  const closeSheet = () =>
    setParams((p) => {
      p.delete('sel');
      return p;
    });
  return (
    <Stack>
      {m.conversation && (
        <PathSwitch
          paths={Object.entries(m.path_words).filter(([k]) => k === 'chat' || k === 'mapping')}
          current={m.conversation.path}
          source={m.conversation.path_source}
          why={m.conversation.path_source === 'you' ? `You switched to ${m.path_words[m.conversation.path] ?? m.conversation.path}.` : m.why && `Picked by the assistant: ${m.why}`}
          onSwitch={a.switchPath}
        />
      )}
      {m.notice && <Callout>{m.notice}</Callout>}
      {m.paused && <Text small muted>{m.paused}</Text>}
      {write.data && !write.data.ok && <Callout tone="failure" live>{write.data.message}</Callout>}
      <WbLayout conversation={<Conversation m={m} a={a} text={text} setText={setText} send={send} streaming={streaming} />} aside={m.sheet && <PageSheet sheet={m.sheet} onClose={closeSheet} a={a} />} />
      <Recent m={m} portal={portal} />
    </Stack>
  );
}

/** The Workbench (beta, spec 043; designer 14-workbench.md): the assistant composes the screen for what you are doing. */
export function Workbench() {
  const { portal = '' } = useParams();
  const [params] = useSearchParams();
  const q = useWorkbench(portal, { c: params.get('c'), sel: params.get('sel'), fresh: params.get('new') === '1' });
  return (
    <Shell current="workbench">
      <PageHead title="Workbench" meta={`Beta · the assistant composes this screen for what you are doing · ${portal} · Now`} />
      <QueryState query={q} what="the Workbench">
        {(m) => <Body key={m.conversation?.id ?? 'new'} m={m} portal={portal} />}
      </QueryState>
    </Shell>
  );
}
