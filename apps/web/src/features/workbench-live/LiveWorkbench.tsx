// The live Workbench (spec 075, the R-96 spike; `/app/portals/{p}/workbench/live`): the
// conversation with each turn's A2UI surface under its answer, the stage beside it with the
// conversation's scan live (the server's surface), all over one WebSocket. Composed from the
// design system only (spec 076); the beta Workbench stays as it is.

import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { ComponentApi, SurfaceModel } from '@a2ui/web_core/v0_9';
import { Button, Callout, ChatLog, Composer, Disclosure, Field, Message, PageHead, Plate, Row, Rows, Split, Stack, Suggestions, Text, Textarea, WbLayout } from '../../design-system';
import { useLiveFrame, type LivePageFrame } from '../../app/api-workbench';
import { useWrite } from '../../app/api-write';
import { useGo } from '../../app/RouterAnchor';
import { Shell } from '../../app/Shell';
import { currentStore } from '../../app/store';
import { liveCatalog } from './catalog';
import { LiveContext } from './context';
import type { LiveMessage } from './protocol';
import { useLiveWorkbench, type Live } from './useLiveWorkbench';

const WHO: Record<LiveMessage['role'], string> = { assistant: 'Assistant', user: 'You', system: 'Event' };

/** The assistant's state in a word: unreachable, answering, idle. */
const assistantWord = (live: Live): string => {
  if (!live.chatUp) return 'unreachable';
  return live.busy ? 'answering' : 'idle';
};

const Surface = ({ s }: { s: SurfaceModel<ComponentApi> }) => <A2uiSurface surface={s as never} />;

function Turns({ live }: { live: Live }) {
  const turns = [...new Set(live.messages.map((m) => m.turn))];
  const byId = new Map(live.surfaces.map((s) => [s.id, s]));
  return (
    <ChatLog label="Conversation" follow={`${String(live.messages.length)}-${String(live.streaming.length)}-${String(live.surfaces.length)}`}>
      {turns.map((n) => {
        const surface = byId.get(`t${String(n)}`);
        return (
          <Stack key={n}>
            {live.messages
              .filter((m) => m.turn === n)
              .map((m) =>
                m.role === 'system' ? (
                  <Text key={m.id} small muted block>
                    {m.content}
                  </Text>
                ) : (
                  <Message key={m.id} who={WHO[m.role]} mine={m.role === 'user'}>
                    <Text block>{m.content}</Text>
                  </Message>
                ),
              )}
            {surface && <Surface s={surface} />}
          </Stack>
        );
      })}
      {live.streaming && (
        <Message who="Assistant">
          <Text block>{live.streaming}</Text>
        </Message>
      )}
    </ChatLog>
  );
}

function Composing({ onSend, disabled, busy }: { onSend: (text: string) => void; disabled: string | null; busy: boolean }) {
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <Composer onSubmit={send} label="Write to the Workbench">
      <Field label="Message">
        <Textarea rows={2} value={text} disabled={disabled !== null} placeholder="Ask, or tell the crawler what to do" onChange={(e) => setText(e.target.value)} />
      </Field>
      <Split>
        <Text small muted>{disabled ?? (busy ? 'The assistant is answering…' : 'Enter a message and Send')}</Text>
        <Button type="submit" variant="strong" disabled={disabled !== null || !text.trim()}>
          Send
        </Button>
      </Split>
    </Composer>
  );
}

function Stage({ live }: { live: Live }) {
  const stage = live.surfaces.find((s) => s.id === 'stage');
  const sel = live.state?.ui.selected;
  return (
    <Plate title={live.state?.live ? 'The conversation’s scan, live' : 'No scan yet'} label="Stage">
      <Stack>
        {stage ? <Surface s={stage} /> : <Text small muted>Ask the assistant to start a map scan; its graph and progress appear here as it runs.</Text>}
        {sel && <Text small muted>{`Selected: ${sel.route}. Your next message carries it.`}</Text>}
        <Button size="sm" onClick={() => live.act('persona.new', { name: 'new-persona' })}>
          Add a persona…
        </Button>
      </Stack>
    </Plate>
  );
}

function Status({ live, frame, open }: { live: Live; frame: LivePageFrame | undefined; open: boolean }) {
  const st = live.state;
  const paused = st?.portal.paused ?? frame?.paused;
  return (
    <Text small muted block>
      {`Socket: ${open ? live.status : 'none yet (your first message starts the conversation)'} · assistant: ${assistantWord(live)}${st ? ` · ${st.portal.id} on ${st.portal.environment}` : ''}${paused ? ` · ${paused}` : ''}`}
    </Text>
  );
}

function Recent({ frame, portal, current }: { frame: LivePageFrame | undefined; portal: string; current: string | null }) {
  if (!frame?.recent.length) return null;
  const href = (c?: string) => `/app/portals/${encodeURIComponent(portal)}/workbench/live${c ? `?c=${c}` : ''}`;
  return (
    <Disclosure summary={`Live conversations (${String(frame.recent.length)})`}>
      <Rows label="Live conversations">
        {frame.recent.map((r) => (
          <Row key={r.id} current={r.id === current} aside={<Text small muted>{r.created_at.slice(0, 16)}</Text>}>
            <Text href={href(r.id)}>{r.title ?? (r.first || 'Untitled')}</Text>
          </Row>
        ))}
        <Row>
          <Text href={href()}>New conversation</Text>
        </Row>
      </Rows>
    </Disclosure>
  );
}

/** One page per portal and conversation: a switch starts clean (no old socket or state, F-09). */
export function LiveWorkbench() {
  const { portal = '' } = useParams();
  const [params] = useSearchParams();
  const c = params.get('c');
  return <LivePage key={`${portal}:${c ?? ''}`} portal={portal} c={c} />;
}

function LivePage({ portal, c }: { portal: string; c: string | null }) {
  const go = useGo();
  const store = currentStore();
  const frame = useLiveFrame(portal);
  const live = useLiveWorkbench(c, store, liveCatalog);
  const first = useWrite(['workbench-live', portal]);
  const [error, setError] = useState<string | null>(null);
  const send = (text: string) => {
    if (c) return live.say(text);
    first.mutate(
      { path: `/api/workbench/portals/${encodeURIComponent(portal)}/turns`, body: { c: '', text, ctx: [], live: true } },
      {
        onSuccess: (r) => {
          if (r.ok && r.href) go(r.href);
          else setError(r.message);
        },
      },
    );
  };
  const notices = [...live.notices, ...(error ? [{ tone: 'failure' as const, text: error }] : [])];
  return (
    <Shell current="workbench">
      <PageHead title="Live Workbench" meta={`Spike (R-96) · A2UI over a WebSocket · ${portal}`} />
      <LiveContext.Provider value={{ conversation: c ?? '', state: live.state }}>
        <Stack>
          <Status live={live} frame={frame.data} open={c !== null} />
          {notices.map((n, i) => (
            <Callout key={i} tone={n.tone === 'failure' ? 'failure' : 'ok'} live>
              {n.text}
            </Callout>
          ))}
          <WbLayout
            conversation={
              <Stack>
                {c ? <Turns live={live} /> : <Suggestions items={frame.data?.starters ?? []} onPick={send} />}
                <Composing onSend={send} disabled={frame.data?.blocked ?? null} busy={live.busy} />
              </Stack>
            }
            aside={<Stage live={live} />}
          />
          <Recent frame={frame.data} portal={portal} current={c} />
        </Stack>
      </LiveContext.Provider>
    </Shell>
  );
}
