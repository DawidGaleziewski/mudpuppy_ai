import { useState } from 'react';
import { Button, Cluster, CommandCard, Facts, Film, FilmItem, GenView, Meter, Mini, Narration, Sheet, Stack, Table, Tag, Text, shortScanId } from '../design-system';
import type { StatusOut } from '../app/api';
import { stateHref } from '../app/api-state';
import type { WbCard, WbCommandCard, WbPage, WbPageModel, WbScan, WbTurn } from '../app/api-workbench';
import { argsOf, draftOf, PersonaFields, problemsOf, type PersonaArgs, type PersonaDraft } from '../app/PersonaForm';
import { ShownStatus } from '../app/ShownStatus';

/** What a card can do on the page: select a page, ask about something, open a command, switch path, answer feedback. */
export interface WbActions {
  model: WbPageModel;
  sel: string | null;
  select: (sel: string) => void;
  ask: (text: string) => void;
  open: (turn: number, command: string, scan: string) => void;
  switchPath: (path: string) => void;
  feedback: (view: string, answer: { value: string; toggle?: string; text?: string }) => void;
  /** `args`: an editable card's fields as the person left them (persona.add, spec 072). */
  confirm: (id: string, token: string, persona: string | null, args?: Record<string, unknown>) => void;
  cancel: (id: string) => void;
  /** Undo a done persona.add. */
  undo: (id: string) => void;
  /** Open an Add-a-persona card from a Start card (spec 072, designer 19/04). */
  addPersona: (turn: number, name: string) => void;
}

const clock = (iso: string | null | undefined) => (iso && iso.length >= 19 ? `${iso.slice(11, 19)}Z` : '—');
const evidence = (ref: string | null) => (ref ? `/evidence/${ref}` : null);
const status = (s: StatusOut | undefined) => (s ? { status: (s.shape ?? 'todo') as 'ok', children: s.word } : null);
const docHref = (portal: string, key: string) => `/app/portals/${encodeURIComponent(portal)}/docs/${encodeURIComponent(key)}`;

const METER = { running: 'running', finished: 'ok' } as const;

function ScanMeter({ s }: { s: WbScan }) {
  const where = s.here?.route ?? '—';
  return (
    <Meter
      label={`AI scan ${shortScanId(s.run_id)} · ${s.status === 'running' ? 'now at' : 'ended at'} ${where}`}
      value={s.status === 'running' ? 0 : 100}
      max={100}
      detail={`${String(s.steps)} steps · ${String(s.pages)} pages · ${String(s.queued)} queued`}
      status={METER[s.status as keyof typeof METER] ?? 'stopped'}
      srLabel="Scan progress"
    />
  );
}

function pageState(s: WbScan, p: WbPage): 'failed' | 'here' | null {
  if (p.failed) return 'failed';
  return s.status === 'running' && s.here?.state_id === p.state_id ? 'here' : null;
}

const WORD = { failed: ['failed', 'Failed here'], here: ['running', 'Crawler here'] } as const;

function LiveMap({ s, a }: { s: WbScan; a: WbActions }) {
  return (
    <Stack>
      <ScanMeter s={s} />
      <Film>
        {s.route_pages.map((p) => {
          const state = pageState(s, p);
          const [shape, word] = state ? WORD[state] : (['ok', 'Visited'] as const);
          const sel = `${p.route}:${String(p.state)}`;
          return (
            <FilmItem
              key={`${p.order}-${p.state_id}`}
              order={p.order}
              route={`${p.route}${p.state > 1 ? ` · step ${String(p.state)}` : ''}`}
              picture={evidence(p.screenshot_ref)}
              state={state}
              status={{ status: shape, children: word }}
              sidePages={p.side_pages}
              pressed={a.sel === sel}
              onSelect={() => a.select(sel)}
            />
          );
        })}
        {s.queued > 0 && s.status === 'running' && <FilmItem route={`+${String(s.queued)} queued`} state="frontier" status={{ status: 'queued', children: 'Queued' }} />}
      </Film>
      {s.status === 'running' && <Text small muted>This card updates in place while the scan runs.</Text>}
    </Stack>
  );
}

function ErrorCard({ card, s, a }: { card: WbCard; s: WbScan; a: WbActions }) {
  const last = s.events[s.events.length - 1];
  return (
    <Stack>
      {last && <Text small muted>{`step ${String(last.step)} · ${clock(s.ended_at)}`}</Text>}
      <Text small>{`${s.stop_reason ? `${s.stop_reason}. ` : ''}The scan stopped; ${String(s.pages)} pages and ${String(s.queued)} queued links are kept.`}</Text>
      <Cluster>
        <Button size="sm" variant="strong" onClick={() => a.open(card.turn, 'scan.resume', s.run_id)}>Resume from last checkpoint</Button>
        <Button size="sm" variant="quiet" onClick={() => a.ask('Why did it stop here?')}>Ask why</Button>
      </Cluster>
    </Stack>
  );
}

function Records({ card, portal }: { card: WbCard; portal: string }) {
  if (card.type === 'RecordCard') {
    const r = card.record;
    if (!r) return <Text small muted>This record is not in the portal model any more.</Text>;
    return (
      <Stack>
        <Cluster>
          <Tag size="sm" href={docHref(portal, r.key)}>{r.key}</Tag>
          {r.type_word && <Text small>{r.type_word}</Text>}
          <Text strong asIs>{r.title}</Text>
          <ShownStatus status={{ shape: r.confirmed ? 'ok' : 'inferred', word: r.confirmed ? 'Confirmed' : 'Proposed' }} />
        </Cluster>
        <Text small href={docHref(portal, r.key)}>Open the record</Text>
      </Stack>
    );
  }
  return (
    <Table
      caption={card.frame.title}
      dense
      flush
      rows={card.records}
      rowKey={([key]) => key}
      columns={[
        { header: 'Record', rowHeader: true, cell: ([key]) => <Tag size="sm" href={docHref(portal, key)}>{key}</Tag> },
        { header: 'Title', cell: ([, r]) => (r ? <Text asIs>{r.title}</Text> : <Text muted>Not found</Text>) },
        { header: 'Status', cell: ([, r]) => (r ? <ShownStatus status={{ shape: r.confirmed ? 'ok' : 'inferred', word: r.confirmed ? 'Confirmed' : 'Proposed' }} /> : null) },
      ]}
    />
  );
}

function Body({ card, a }: { card: WbCard; a: WbActions }) {
  const s = card.scan;
  const portal = a.model.portal ?? '';
  if (['LiveMap', 'ScanMeter', 'ErrorCard', 'PageMiniature'].includes(card.type) && !s) return <Text small muted>This scan is not in the store.</Text>;
  if (card.type === 'LiveMap' && s) return <LiveMap s={s} a={a} />;
  if (card.type === 'ScanMeter' && s) return <ScanMeter s={s} />;
  if (card.type === 'ErrorCard' && s) return <ErrorCard card={card} s={s} a={a} />;
  if (card.type === 'PageMiniature') {
    const p = card.page;
    if (!p) return <Text small muted>This page is not in the scan.</Text>;
    const sel = `${p.route}:${String(p.state)}`;
    return <FilmItem route={p.route} picture={evidence(p.screenshot_ref)} pictureHeight={120} status={p.failed ? { status: 'failed', children: 'Failed here' } : { status: 'ok', children: 'Visited' }} pressed={a.sel === sel} onSelect={() => a.select(sel)} />;
  }
  return <Records card={card} portal={portal} />;
}

/** A stopped or finished live card under a newer card folds to one line (WB-UI-40). */
function Folded({ card, a }: { card: WbCard; a: WbActions }) {
  const [open, setOpen] = useState(false);
  const s = card.scan as WbScan;
  return (
    <GenView id={card.frame.dom_id} title={card.frame.title} source={card.frame.source} card status={status(a.model.statuses.wb_scan[s.status])}>
      <Stack>
        {/* the scan line's one grammar (designer 19/12); the card's status says stopped or done */}
        <Text small>{`AI scan ${shortScanId(s.run_id)} · ${String(s.steps)} steps · ${String(s.pages)} pages · ${String(s.queued)} queued${s.here ? ` · at ${s.here.route}` : ''}`}</Text>
        <Button size="sm" variant="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Fold' : 'Expand'}</Button>
        {open && <LiveMap s={s} a={a} />}
      </Stack>
    </GenView>
  );
}

/** One placed card: its frame (Why and feedback on the lead frame) and the component's body. */
export function Card({ card, view, a }: { card: WbCard; view: string | null; a: WbActions }) {
  if (card.folded && card.scan) return <Folded card={card} a={a} />;
  const f = card.frame;
  const m = a.model;
  const why = f.why && {
    path: `${m.path_words[f.why.path] ?? f.why.path} · ${f.why.by_you ? 'you switched to it' : 'picked by the assistant'}`,
    because: f.why.because,
    asked: f.why.asked,
    shows: f.why.shows,
    data: f.why.data,
    switches: f.why.other_paths.map((p) => [p, m.path_words[p] ?? p] as const),
    onSwitch: a.switchPath,
  };
  const feedback = f.feedback && view ? { value: f.feedback.value, reasons: f.feedback.reasons, choices: m.reasons, onAnswer: (x: { value: string; toggle?: string; text?: string }) => a.feedback(view, x) } : null;
  const shown = f.state === 'stale' ? status(m.statuses.wb_scan.stale) : status(f.status ? m.statuses.wb_scan[f.status] : undefined);
  return (
    <GenView id={f.dom_id} title={f.title} titleAsIs={f.title_mono} source={f.source} card={f.card} failure={f.failure} state={f.state} status={shown} why={why} feedback={feedback}>
      <Body card={card} a={a} />
    </GenView>
  );
}

/** A name for a persona the person opens a card for: the first `persona-N` not taken (they change it). */
const freeName = (taken: readonly string[]) => {
  let n = 1;
  while (taken.includes(`persona-${String(n)}`)) n += 1;
  return `persona-${String(n)}`;
};

/** Add a persona (spec 072, designer 19/04): an editable card; Confirm sends the fields as shown. */
function PersonaCommand({ c, a }: { c: WbCommandCard; a: WbActions }) {
  const id = c.dom_id.replace(/^cmd-/, '');
  const signIns = c.sign_ins ?? [];
  const drafted = draftOf(c.args as unknown as PersonaArgs, signIns);
  const [draft, setDraft] = useState<PersonaDraft>(drafted);
  const ready = Object.keys(problemsOf(draft, c.personas)).length === 0;
  return (
    <CommandCard
      title={c.title}
      state={c.state}
      status={status(a.model.statuses.wb_cmd[c.state])}
      facts={c.facts}
      reason={c.reason}
      proposedBy={c.proposed_by}
      edit={{ body: <PersonaFields draft={draft} onChange={setDraft} signIns={signIns} taken={c.personas} drafted={drafted} />, ready }}
      runningWord={c.running_word}
      result={c.result}
      resultLinks={c.result_links}
      error={c.error}
      errorRef={c.error_ref && <Text mono small href={`/app/errors/${encodeURIComponent(c.error_ref)}`}>{c.error_ref}</Text>}
      onConfirm={() => a.confirm(id, c.token ?? '', null, argsOf(draft) as unknown as Record<string, unknown>)}
      onCancel={() => a.cancel(id)}
      {...(c.undo_url ? { onUndo: () => a.undo(id) } : {})}
    />
  );
}

export function Command({ c, a, turn }: { c: WbCommandCard; a: WbActions; turn: number }) {
  const id = c.dom_id.replace(/^cmd-/, '');
  if (c.editable) return <PersonaCommand c={c} a={a} />;
  return (
    <CommandCard
      title={c.title}
      state={c.state}
      status={status(a.model.statuses.wb_cmd[c.state])}
      facts={c.facts}
      reason={c.reason}
      proposedBy={c.proposed_by}
      askPersona={c.ask_persona}
      personas={c.personas}
      persona={c.persona}
      noPersona={c.no_persona_url}
      runningWord={c.running_word}
      result={c.result}
      resultLinks={c.result_links}
      error={c.error}
      errorRef={c.error_ref && <Text mono small href={`/app/errors/${encodeURIComponent(c.error_ref)}`}>{c.error_ref}</Text>}
      onConfirm={(persona) => a.confirm(id, c.token ?? '', persona)}
      onCancel={() => a.cancel(id)}
      {...(c.ask_persona ? { onAddPersona: () => a.addPersona(turn, freeName(c.personas)) } : {})}
    />
  );
}

export function TurnNarration({ rt, a }: { rt: WbTurn; a: WbActions }) {
  if (!rt.narration.length) return null;
  return <Narration lines={rt.narration.map((l) => ({ ...l, clock: clock(l.at) }))} onAsk={(ref) => a.ask(`What happened at event ${ref}?`)} />;
}

/** The selected page in the side sheet (WB-UI-07): not generated, no mark, no Why. */
export function PageSheet({ sheet, onClose, a }: { sheet: [WbScan, WbPage]; onClose: () => void; a: WbActions }) {
  const [s, p] = sheet;
  return (
    <Sheet title={`${p.route}${p.state > 1 ? ` · step ${String(p.state)}` : ''}`} onClose={onClose}>
      <Stack>
        <Mini src={evidence(p.screenshot_ref)} height={120} />
        <Cluster>
          <Text strong asIs>{p.title}</Text>
          <ShownStatus status={p.failed ? { shape: 'failed', word: 'Failed here' } : { shape: 'ok', word: 'Visited' }} />
        </Cluster>
        <Facts
          items={[
            ['Visited', <Text key="v" mono small>{`#${String(p.order)} · step ${String(p.step)} · ${clock(p.at)}`}</Text>],
            ['Side trips', `${String(p.side_pages)} page${p.side_pages === 1 ? '' : 's'} opened from here`],
            ['Scan', <Tag key="s" size="sm" href={`/app/scans/${encodeURIComponent(s.run_id)}`} title={s.run_id}>{shortScanId(s.run_id)}</Tag>],
            ['Page', <Text key="p" small href={stateHref(p.state_id)}>Open the recorded page</Text>],
          ]}
        />
        <Cluster>
          <Button size="sm" variant="strong" onClick={() => a.ask(`About ${p.route} in scan ${shortScanId(s.run_id)}: `)}>Ask about this</Button>
        </Cluster>
      </Stack>
    </Sheet>
  );
}
