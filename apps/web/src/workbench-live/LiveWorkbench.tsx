// The live Workbench (spec 075, the R-96 spike; `/app/portals/{p}/workbench/live`): the
// conversation on the left with each turn's A2UI surface under it, the stage on the right with the
// conversation's scan live (the server's surface), all over one WebSocket. Placeholder grey boxes
// (owner 2026-10-24); the beta Workbench stays as it is.

import { useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { ComponentApi, SurfaceModel } from '@a2ui/web_core/v0_9';
import { PageHead } from '../design-system';
import { getJson } from '../app/api';
import { postJson } from '../app/api-write';
import { useGo } from '../app/RouterAnchor';
import { Shell } from '../app/Shell';
import { currentStore } from '../app/store';
import { liveCatalog } from './catalog';
import { LiveContext } from './context';
import type { LiveMessage } from './protocol';
import { useLiveWorkbench, type Live } from './useLiveWorkbench';
import './placeholder.css';

interface LivePageFrame {
  recent: { id: string; title: string | null; first: string; created_at: string }[];
  paused: string | null;
  blocked: string | null;
  starters: string[];
}

const WHO: Record<LiveMessage['role'], string> = { assistant: 'Assistant', user: 'You', system: 'Event' };

/** The assistant's state in a word: down, answering, idle. */
const assistantWord = (live: Live): string => {
  if (!live.chatUp) return 'unreachable';
  return live.busy ? 'answering' : 'idle';
};

const Surface = ({ s }: { s: SurfaceModel<ComponentApi> }) => (
  <div className="wbx-surface" data-surface={s.id}>
    <A2uiSurface surface={s as never} />
  </div>
);

function Turns({ live }: { live: Live }) {
  const turns = [...new Set(live.messages.map((m) => m.turn))];
  const byId = new Map(live.surfaces.map((s) => [s.id, s]));
  const said = (m: LiveMessage) => WHO[m.role];
  return (
    <ol className="wbx-log" aria-label="Conversation" aria-live="polite">
      {turns.map((n) => {
        const surface = byId.get(`t${String(n)}`);
        return (
          <li key={n} className="wbx-turn">
            {live.messages
              .filter((m) => m.turn === n)
              .map((m) => (
                <p key={m.id} className="wbx-msg" data-role={m.role}>
                  <strong>{said(m)}:</strong> {m.content}
                </p>
              ))}
            {surface && <Surface s={surface} />}
          </li>
        );
      })}
      {live.streaming && (
        <li className="wbx-turn">
          <p className="wbx-msg" data-role="assistant">
            <strong>Assistant:</strong> {live.streaming}
          </p>
        </li>
      )}
    </ol>
  );
}

function Composer({ onSend, disabled, busy }: { onSend: (text: string) => void; disabled: string | null; busy: boolean }) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <form className="wbx-composer" onSubmit={submit} aria-label="Write to the Workbench">
      <label className="wbx-field">
        <span>Message</span>
        <textarea rows={2} value={text} disabled={disabled !== null} onChange={(e) => setText(e.target.value)} placeholder="Ask, or tell the crawler what to do" />
      </label>
      <div className="wbx-actions">
        <span className="wbx-muted">{disabled ?? (busy ? 'The assistant is answering…' : 'Enter a message and Send')}</span>
        <button type="submit" disabled={disabled !== null || !text.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}

function Stage({ live }: { live: Live }) {
  const stage = live.surfaces.find((s) => s.id === 'stage');
  const sel = live.state?.ui.selected;
  return (
    <aside className="wbx-stage" aria-label="Stage">
      <div className="wbx-box__title">Stage · {live.state?.live ? 'the conversation’s scan, live' : 'no scan yet'}</div>
      {stage ? <Surface s={stage} /> : <p className="wbx-muted">Ask the assistant to start a map scan; its graph and progress appear here as it runs.</p>}
      {sel && (
        <p className="wbx-muted">
          Selected: {sel.route} — your next message carries it.
        </p>
      )}
      <div className="wbx-actions">
        <button type="button" onClick={() => live.act('persona.new', { name: 'new-persona' })}>
          Add a persona…
        </button>
      </div>
    </aside>
  );
}

function Status({ live, frame, open }: { live: Live; frame: LivePageFrame | undefined; open: boolean }) {
  const st = live.state;
  return (
    <p className="wbx-status" role="status">
      Socket: <strong>{open ? live.status : 'none yet (your first message starts the conversation)'}</strong> · assistant: {assistantWord(live)}
      {st && ` · ${st.portal.id} on ${st.portal.environment}`}
      {(st?.portal.paused ?? frame?.paused) && ` · ${String(st?.portal.paused ?? frame?.paused)}`}
    </p>
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
  const frame = useQuery({
    queryKey: ['workbench-live', portal],
    queryFn: () => getJson<LivePageFrame>(`/api/workbench/live/portals/${encodeURIComponent(portal)}`),
  });
  const live = useLiveWorkbench(c, store, liveCatalog);
  const [error, setError] = useState<string | null>(null);
  const send = (text: string) => {
    if (c) return live.say(text);
    void postJson({ path: `/api/workbench/portals/${encodeURIComponent(portal)}/turns`, body: { c: '', text, ctx: [], live: true } }).then((r) => {
      if (r.ok && r.href) go(r.href);
      else setError(r.message);
    });
  };
  return (
    <Shell current="workbench">
      <PageHead title="Live Workbench" meta={`Spike (R-96) · A2UI over a WebSocket · ${portal} · placeholder boxes until the designer's look`} />
      <LiveContext.Provider value={{ conversation: c ?? '', state: live.state }}>
        <Status live={live} frame={frame.data} open={c !== null} />
        {[...live.notices, ...(error ? [{ tone: 'failure' as const, text: error }] : [])].map((n, i) => (
          <p key={i} className="wbx-notice" data-tone={n.tone} role="alert">
            {n.text}
          </p>
        ))}
        <div className="wbx-page">
          <section className="wbx-conv" aria-label="Conversation">
            {c ? <Turns live={live} /> : <Starters frame={frame.data} onPick={send} />}
            <Composer onSend={send} disabled={frame.data?.blocked ?? null} busy={live.busy} />
            <Recent frame={frame.data} portal={portal} current={c} />
          </section>
          <Stage live={live} />
        </div>
      </LiveContext.Provider>
    </Shell>
  );
}

function Starters({ frame, onPick }: { frame: LivePageFrame | undefined; onPick: (t: string) => void }) {
  return (
    <div className="wbx-box">
      <div className="wbx-box__title">Nothing yet</div>
      <div className="wbx-actions">
        {(frame?.starters ?? []).map((s) => (
          <button key={s} type="button" onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Recent({ frame, portal, current }: { frame: LivePageFrame | undefined; portal: string; current: string | null }) {
  const go = useGo();
  if (!frame?.recent.length) return null;
  return (
    <details className="wbx-box">
      <summary>Live conversations ({frame.recent.length})</summary>
      <ul>
        {frame.recent.map((r) => (
          <li key={r.id}>
            <button type="button" disabled={r.id === current} onClick={() => go(`/app/portals/${encodeURIComponent(portal)}/workbench/live?c=${r.id}`)}>
              {r.title ?? (r.first || 'Untitled')} · {r.created_at.slice(0, 16)}
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => go(`/app/portals/${encodeURIComponent(portal)}/workbench/live`)}>
            New conversation
          </button>
        </li>
      </ul>
    </details>
  );
}
