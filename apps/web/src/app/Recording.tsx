import { useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { Button, Callout, Check, Cluster, Facts, Fieldset, LinkButton, RecordingDialog, Shot, Split, Stack, SubHead, Tag, Text } from '../design-system';
import { recordingHref, useStateView, type StateView } from './api-state';
import { QueryState } from './QueryState';
import { RecordingAccess } from './RecordingAccess';
import { Shell } from './Shell';

const docHref = (portal: string, key: string) => `/app/portals/${encodeURIComponent(portal)}/docs/${encodeURIComponent(key)}`;
const scanHref = (scan: string) => `/app/scans/${encodeURIComponent(scan)}`;

interface Shown {
  hl: boolean;
  pins: boolean;
  elements: boolean;
}

/** The marks on the picture: the assistant's element, the amendment pins, every element numbered. */
function marksOf(v: StateView, hl: string | null, shown: Shown) {
  const els = v.page.elements;
  return [
    ...(shown.hl && hl ? els.filter((e) => e.key === hl).map((e) => ({ region: e, label: 'Marked by assistant', title: e.key })) : []),
    ...(shown.pins ? v.amendments.items.flatMap((a) => (a.pin ? [{ region: a.pin, label: a.key, note: true }] : [])) : []),
    ...(shown.elements ? els.map((e, i) => ({ region: e, label: String(i + 1), title: e.key })) : []),
  ];
}

function Figure({ v, view, marks }: { v: StateView; view: 'shot' | 'wire'; marks: ReturnType<typeof marksOf> }) {
  const h = v.page.head;
  const name = h.title || h.route;
  if (view === 'shot' && h.shot) return <Shot src={h.shot} alt={`Recording of ${name}`} marks={marks} />;
  if (h.wire) return <Shot src={h.wire} alt={`Wireframe of ${name}, drawn from the recorded page structure`} />;
  return <Text small muted>Nothing was recorded for this view.</Text>;
}

function facts(v: StateView) {
  const h = v.page.head;
  const [first, ...also] = v.page.urls;
  const cited = v.page.citing.map((r) => (
    <Tag key={r.key} size="sm" href={docHref(r.portal, r.key)}>
      {r.key}
    </Tag>
  ));
  return [
    ['Screen', <Text key="s" asIs>{`${h.title || h.route}${v.place ? ` · variant r${String(v.place.ordinal)}` : ''}`}</Text>],
    ['Reached at', <Text key="r" route>{first?.url ?? h.route}</Text>],
    ...(also.length ? [['Also reached at', `${String(also.length + v.page.urls_more)} more URLs`] as const] : []),
    ['Settled', h.stabilization],
    ['Cited by', cited.length ? <Cluster key="c">{cited}</Cluster> : 'no record'],
  ] as const;
}

function ShowOnPicture({ v, hl, shown, setShown }: { v: StateView; hl: string | null; shown: Shown; setShown: (s: Shown) => void }) {
  const marked = hl !== null && v.page.elements.some((e) => e.key === hl);
  const pins = v.amendments.items.filter((a) => a.pin).length;
  return (
    <Fieldset legend="Show on the picture">
      {hl !== null && <Check label={`Assistant's marks (${marked ? '1' : '0'})`} checked={shown.hl} onChange={(e) => setShown({ ...shown, hl: e.target.checked })} />}
      <Check label={`Amendment pins (${String(pins)})`} checked={shown.pins} onChange={(e) => setShown({ ...shown, pins: e.target.checked })} />
      <Check label={`Elements (${String(v.page.elements.length)})`} checked={shown.elements} onChange={(e) => setShown({ ...shown, elements: e.target.checked })} />
      {hl && !marked && <Text small muted>{`${hl} is not on this recording.`}</Text>}
    </Fieldset>
  );
}

function Aside({ v, hl, shown, setShown }: { v: StateView; hl: string | null; shown: Shown; setShown: (s: Shown) => void }) {
  const h = v.page.head;
  const missing = v.amendments.items.filter((a) => a.state === 'active' && a.element && !a.pin);
  return (
    <Stack>
      <Facts items={facts(v)} />
      {h.shot && <ShowOnPicture v={v} hl={hl} shown={shown} setShown={setShown} />}
      {v.amendments.items.length > 0 && (
        <Stack>
          <SubHead>Amendments on this screen</SubHead>
          {v.amendments.items.map((a) => (
            <Text key={a.id} small>{`${a.key} · ${a.text ?? a.attachment ?? ''}`}</Text>
          ))}
          {missing.map((a) => (
            <Text key={a.id} small muted>{`${a.key} · not on this visit`}</Text>
          ))}
        </Stack>
      )}
      {h.wire && h.excalidraw && (
        <Cluster>
          <LinkButton size="sm" href={`${h.wire}?download=${encodeURIComponent(h.title || 'wireframe')}`} download>Download SVG</LinkButton>
          <LinkButton size="sm" href={`${h.excalidraw}?download=${encodeURIComponent(h.title || 'wireframe')}`} download>Download Excalidraw</LinkButton>
        </Cluster>
      )}
      <RecordingAccess a={v.access} />
      <LinkButton size="sm" href={scanHref(h.first_seen_run)}>Open in Scans</LinkButton>
    </Stack>
  );
}

/** The two personas the address asks to see side by side (`left`, `right`), as the API takes them. */
function pairOf(params: URLSearchParams) {
  const left = params.get('left');
  const right = params.get('right');
  return left && right ? new URLSearchParams({ left, right }).toString() : '';
}

export interface RecordingSet {
  /** The recordings the dialog steps through (a screen's variants), and their labels. */
  states: readonly { state: string; label: string }[];
  go: (state: string) => void;
}

function Foot({ state, set }: { state: string; set: RecordingSet | undefined }) {
  const [copied, setCopied] = useState(false);
  const at = set ? set.states.findIndex((s) => s.state === state) : -1;
  const prev = set && at > 0 ? set.states[at - 1] : undefined;
  const next = set && at >= 0 ? set.states[at + 1] : undefined;
  const copy = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true));
  };
  return (
    <Split>
      <Cluster>
        {set && (
          <>
            <Button size="sm" disabled={!prev} onClick={() => prev && set.go(prev.state)}>← earlier variant</Button>
            <Button size="sm" disabled={!next} onClick={() => next && set.go(next.state)}>later variant →</Button>
            <Text small muted>{`${String(at + 1)} of ${String(set.states.length)} variants`}</Text>
          </>
        )}
      </Cluster>
      <Button size="sm" onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</Button>
    </Split>
  );
}

/**
 * A recording in the dialog over its Screen page or its scan (designer Q10): the picture with the
 * assistant's mark (`hl`), the amendment pins or the elements, and the facts about this visit.
 */
export function RecordingView({ state, hl, onClose, set }: { state: string; hl: string | null; onClose: () => void; set?: RecordingSet }) {
  const [params] = useSearchParams();
  const q = useStateView(state, pairOf(params));
  const [view, setView] = useState<'shot' | 'wire'>('shot');
  const [shown, setShown] = useState<Shown>({ hl: true, pins: true, elements: false });
  const v = q.data;
  if (!v) return q.error ? <Callout tone="failure" title="Could not open the recording">{q.error instanceof Error ? q.error.message : 'The request failed.'}</Callout> : null;
  const h = v.page.head;
  const shownView = h.shot ? view : 'wire';
  return (
    <RecordingDialog
      open
      onClose={onClose}
      heading={`${h.title || h.route}${v.place ? ` · variant r${String(v.place.ordinal)}` : ''} · recording`}
      meta={`visit ${h.first_seen_run.slice(0, 13)} · ${h.created_at}`}
      view={shownView}
      onView={h.shot && h.wire ? setView : undefined}
      figure={<Figure v={v} view={shownView} marks={marksOf(v, hl, shown)} />}
      aside={<Aside v={v} hl={hl} shown={shown} setShown={setShown} />}
      foot={<Foot state={state} set={set} />}
    />
  );
}

/**
 * An old recording address (`/states/{id}`, docs evidence, exports): it opens on its Screen page,
 * or over its scan's recorded pages when no screen holds it yet (designer Q10).
 */
export function RecordingRedirect() {
  const { state = '' } = useParams();
  const [params] = useSearchParams();
  const q = useStateView(state);
  const hl = params.get('hl');
  const pair = pairOf(params);
  const keep = `${hl !== null ? `&hl=${encodeURIComponent(hl)}` : ''}${pair ? `&${pair}` : ''}`;
  if (q.data) {
    const v = q.data;
    const to = v.place ? recordingHref(v.place, state) : `/app/scans/${encodeURIComponent(v.page.head.first_seen_run)}/states?recording=${encodeURIComponent(state)}`;
    return <Navigate replace to={`${to}${keep}`} />;
  }
  return (
    <Shell current="screens">
      <QueryState query={q} what="the recording">
        {() => null}
      </QueryState>
    </Shell>
  );
}
