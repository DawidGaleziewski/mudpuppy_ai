import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button, Callout, Choice, Chip, Cluster, Compare, CompareSide, Facts, Field, Input, Kbd, KeyBar, LinkButton, Note, PageHead, Plate, Row, Rows, Shot, Split, Stack, Status, SubHead, Tag, Text } from '../design-system';
import { labelPair, sameScreenHref, sameScreenKey, useSameScreen, type Pair, type SameScreenView } from '../app/api-same-screen';
import type { ChangeSide } from '../app/api-changes';
import { stateHref } from '../app/api-state';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { useGo } from '../app/RouterAnchor';
import { Shell } from '../app/Shell';

const WHAT: Record<string, string> = {
  same: 'Keep one screen; the two stay variants of it.',
  same_data: 'Keep one screen; what differs is content that depends on data, documented once.',
  different: 'Two screens: the next rebuild splits them apart.',
};

const pct = (x: number) => `${String(Math.round(x * 100))}% alike`;
const reviewHref = (portal: string) => `/app/portals/${encodeURIComponent(portal)}/review`;
const screenHref = (portal: string, key: string) => `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}`;

function Side({ portal, s, screenKey }: { portal: string; s: ChangeSide; screenKey: string | null }) {
  const src = s.shot ?? s.wire;
  return (
    <CompareSide title={<Text asIs>{s.label}</Text>} aside={screenKey && <Tag size="sm" href={screenHref(portal, screenKey)}>{screenKey}</Tag>}>
      <Stack>
        {src ? <Shot src={src} alt={`${s.label}: ${s.title ?? s.route ?? 'recorded page'}`} /> : <Text small>No picture was recorded.</Text>}
        {s.state_id && <Text small href={stateHref(s.state_id)}>Open the recorded page</Text>}
        <Facts
          items={[
            ['Title', <Text key="t" asIs>{s.title ?? '(untitled)'}</Text>],
            ['Route', <Text key="r" route>{s.route ?? ''}</Text>],
            ...(s.scan ? [['Last visit', <Cluster key="v"><Tag size="sm" href={`/app/scans/${encodeURIComponent(s.scan)}`} title={s.scan}>{s.scan.slice(0, 13)}</Tag><Text mono small>{s.at ?? ''}</Text></Cluster>] as const] : []),
          ]}
        />
      </Stack>
    </CompareSide>
  );
}

function Conflict({ p, words }: { p: Pair; words: Record<string, string> }) {
  if (!p.conflict || !p.label) return null;
  return (
    <Callout tone="intent" title="A label and the model disagree">
      <Stack>
        <Text block>
          <Text strong>{`Automatic grouping says ${(words[p.model_answer] ?? p.model_answer).toLowerCase()}`}</Text>
          {p.similarity !== null ? `: the two versions are ${pct(p.similarity)}.` : '.'}
        </Text>
        <Text block>
          <Text strong>{`${p.label.by} labelled them ${(words[p.label.answer] ?? p.label.answer).toLowerCase()}`}</Text>
          {` on ${p.label.at}.`}
        </Text>
        {p.label.reason && <Note by={`${p.label.by} · ${p.label.at}`}>{p.label.reason}</Note>}
        <Text small>Your answer settles it. The next model rebuild applies it. Every earlier answer stays in the screen&apos;s History.</Text>
      </Stack>
    </Callout>
  );
}

interface Keys {
  pick: (i: number) => void;
  why: () => void;
  save: () => void;
  skip: (() => void) | null;
  back: () => void;
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !(t instanceof HTMLInputElement && t.type === 'radio');

/** What a key does on this page; false when it is not one of its keys. */
function press(e: KeyboardEvent, k: Keys): boolean {
  if (e.key === 'Enter') {
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return false;
    k.save();
    return true;
  }
  if (typing(e.target)) return false;
  const key = e.key.toLowerCase();
  if (['1', '2', '3'].includes(key)) k.pick(Number(key) - 1);
  else if (key === 'w') k.why();
  else if (key === 's' && k.skip) k.skip();
  else if (key === 'escape') k.back();
  else return false;
  return true;
}

/** 1 / 2 / 3 pick, W why, Enter save, S skip, Esc back; never while typing (but Enter in Why saves) or under a dialog. */
function useKeys(keys: Keys) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (press(e, keys)) e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [keys]);
}

function Answer({ v, ask }: { v: SameScreenView; ask: (a: Ask) => void }) {
  const { portal, screen, answers } = v.page;
  const p = v.page.pair as Pair;
  const [answer, setAnswer] = useState('');
  const [why, setWhy] = useState('');
  const whyRef = useRef<HTMLInputElement>(null);
  const go = useGo();
  const words = Object.fromEntries(answers);
  const next = p.next_pair ? sameScreenHref(portal, { screen, a: p.next_pair[0], b: p.next_pair[1] }) : null;
  const save = () => {
    if (!answer || !v.can_answer) return;
    ask({
      title: `Save "${words[answer] ?? answer}"?`,
      text: `Your answer is saved as a label for these two page versions${p.label ? ` and replaces ${p.label.by}'s, which stays in History` : ''}. The next model rebuild groups them by it.`,
      confirm: 'Save',
      write: labelPair(portal, p.a.state, p.b.state, answer, why.trim()),
      onDone: () => {
        setAnswer('');
        setWhy('');
        go(next ?? sameScreenHref(portal, { screen }));
      },
    });
  };
  useKeys({
    pick: (i) => setAnswer(answers[i]?.[0] ?? ''),
    why: () => whyRef.current?.focus(),
    save,
    skip: next ? () => go(next) : null,
    back: () => go(reviewHref(portal)),
  });
  return (
    <Plate title="Your answer" actions={<Text small muted>Press 1, 2 or 3</Text>}>
      <Stack>
        {answers.map(([key, word], i) => (
          <Choice key={key} name="answer" value={key} checked={answer === key} onChange={setAnswer} label={word} what={WHAT[key] ?? ''} shortcut={String(i + 1)}>
            {p.model_answer === key && <Status status="inferred">Automatic grouping</Status>}
            {p.label?.answer === key && <Chip>{`${p.label.by}'s label · ${p.label.at}`}</Chip>}
          </Choice>
        ))}
        <Split>
          <Field label={<>Why (optional) <Kbd>W</Kbd></>} help="Shown with the label.">
            <Input ref={whyRef} value={why} maxLength={2000} placeholder="One line" autoComplete="off" onChange={(e) => setWhy(e.target.value)} />
          </Field>
          <Cluster>
            {next && <LinkButton href={next}>Skip <Kbd>S</Kbd></LinkButton>}
            <Button variant="primary" disabled={!answer || !v.can_answer} onClick={save}>Save</Button>
          </Cluster>
        </Split>
        {!v.can_answer && <Text small muted>Set MUDPUPPY_REVIEWER to your name to answer.</Text>}
        <Text small>
          <Text strong>What happens:</Text>
          {' your answer is saved as a label for these two page versions. The next model rebuild groups them by it'}
          {p.process ? <>{'; the process '}<Text asIs href={`/app/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(p.process[0])}`}>{p.process[1]}</Text>{' walks this screen.'}</> : '.'}
        </Text>
        <Text small muted>Skip leaves this pair in the queue.</Text>
        <KeyBar keys={[[<><Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd></>, 'answer'], [<Kbd key="w">W</Kbd>, 'why'], [<Kbd key="e">Enter</Kbd>, 'save'], [<Kbd key="s">S</Kbd>, 'skip'], [<Kbd key="x">Esc</Kbd>, 'back to Review']]} />
      </Stack>
    </Plate>
  );
}

function PairView({ v, ask }: { v: SameScreenView; ask: (a: Ask) => void }) {
  const p = v.page.pair as Pair;
  const words = Object.fromEntries(v.page.answers);
  return (
    <Stack>
      <Conflict p={p} words={words} />
      <Split>
        <SubHead section asIs>{`${p.a.screen_title ?? p.sides[0].title ?? ''}: ${p.sides[0].label} and ${p.sides[1].label}`}</SubHead>
        {p.similarity !== null && <Text small muted>{`${pct(p.similarity)} (MinHash)`}</Text>}
      </Split>
      <Compare min="340px">
        <Side portal={v.page.portal} s={p.sides[0]} screenKey={p.a.screen_key} />
        <Side portal={v.page.portal} s={p.sides[1]} screenKey={p.b.screen_key} />
      </Compare>
      {p.differs.length > 0 && <Facts items={p.differs.map((d) => [d.label, <Text key={d.label} asIs>{`${d.before} → ${d.after} (differs)`}</Text>] as const)} />}
      <Answer key={`${p.a.state}-${p.b.state}`} v={v} ask={ask} />
      {p.earlier.length > 0 && (
        <Plate title={`Earlier answers · ${String(p.earlier.length)}`}>
          <Rows>
            {p.earlier.map((e) => (
              <Row key={`${e.by}-${e.at}`} tone="muted" aside={<Text mono small muted>{e.at}</Text>}>
                <Stack>
                  <Text small>{`${e.by}: ${(words[e.answer] ?? e.answer).toLowerCase()}`}</Text>
                  {e.reason && <Note size="sm" by={`${e.by} · ${e.at}`}>{e.reason}</Note>}
                </Stack>
              </Row>
            ))}
          </Rows>
        </Plate>
      )}
    </Stack>
  );
}

function meta(v: SameScreenView) {
  const p = v.page.pair;
  const place = p?.position ? `${String(p.position)} of ${String(p.total)}` : 'not in the queue';
  const parts = [p ? place : null, v.page.screen ? `screen ${v.page.screen}` : null, p?.conflict ? 'conflict' : null];
  return (
    <Stack>
      <Text small>{parts.filter(Boolean).join(' · ')}</Text>
      {v.page.tau !== null && (
        <Text small muted>{`Conflicts first, then the pairs nearest the threshold τ ${v.page.tau.toFixed(2)} (within ±${String(v.page.window)}): those answers move τ most. Then each screen's variants against its first.`}</Text>
      )}
    </Stack>
  );
}

/** Same screen? (designer v2-14, UX-R34): are two page versions one screen? Conflicts first, keyboard first. */
export function SameScreen() {
  const { portal = '' } = useParams();
  const [params] = useSearchParams();
  const pick = { screen: params.get('screen'), a: params.get('a'), b: params.get('b') };
  const query = useSameScreen(portal, pick);
  const { ask, view } = useConfirmedWrite(sameScreenKey(portal));
  return (
    <Shell current="review">
      <QueryState query={query} what="the pair to compare">
        {(v) => (
          <Stack>
            <PageHead
              crumbs={[{ label: 'Review', href: reviewHref(portal) }, { label: 'Same screen?' }]}
              title="Same screen?"
              meta={meta(v)}
              actions={<LinkButton size="md" href={reviewHref(portal)}>Back to Review <Kbd>Esc</Kbd></LinkButton>}
            />
            {view}
            {v.page.pair ? (
              <PairView v={v} ask={ask} />
            ) : (
              <Callout title="Nothing to compare">Every pair of variants is labelled and no label disagrees with the model. New variants show up here after the next scan.</Callout>
            )}
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
