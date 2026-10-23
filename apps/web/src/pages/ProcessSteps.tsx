import { useState, type FormEvent } from 'react';
import {
  Button,
  Callout,
  Cluster,
  Field,
  Note,
  Picture,
  Plate,
  Row,
  Rows,
  Select,
  Stack,
  SubHead,
  Tag,
  Text,
} from '../design-system';
import { docHref, type AsIsDoc, type ProcessPage, type ProcessStep } from '../app/api-process';
import { writes } from '../app/api-write';
import type { Ask } from '../app/ConfirmedWrite';
import { ShownStatus } from '../app/ShownStatus';
import { stateHref } from './RecordedInspector';

function plural(n: number, w: string) {
  return `${String(n)} ${w}${n === 1 ? '' : 's'}`;
}

/** Spec 027 US2–US3: what the as-is still lacks, its sign-off, and the stage moves. */
export function AsIsDocumentation({ d, a, ask }: { d: ProcessPage; a: AsIsDoc; ask: (x: Ask) => void }) {
  const [stage, setStage] = useState(d.stage_value);
  const open = a.questions + a.unconfirmed + a.reanchor;
  const so = a.sign_off;
  const writable = !d.archived_at;
  return (
    <Plate title="As-is documentation" actions={<ShownStatus status={d.stage} />}>
      <Stack>
        <Text small block>
          {open
            ? `Still open on these screens: ${plural(a.questions, 'open question')} · ${plural(a.unconfirmed, 'record')} to confirm · ${plural(a.reanchor, 'amendment')} to re-anchor.`
            : 'Nothing open on these screens: no open questions, no records to confirm, no amendments to re-anchor.'}{' '}
          <Text href="/review">Review</Text>
        </Text>
        {so && (
          <Text small block>
            {`Signed off as documented by ${so.by} · `}
            <Text mono small>
              {so.at}
            </Text>
            {so.signed_rev !== null ? ` · covering A r${String(so.signed_rev)}` : ''}
          </Text>
        )}
        {so?.changed && (
          <Callout tone="intent" title="As-is changed since documented">
            {`A r${String(so.signed_rev)} → r${String(so.head_rev)}: a rescan or an edit changed the screens after the sign-off. See what changed in History, then sign off again.`}
          </Callout>
        )}
        {writable && (
          <Cluster>
            {a.sign_off_action && (
              <Button
                variant={d.model.kind === 'as-is' ? 'primary' : 'strong'}
                onClick={() =>
                  ask({
                    title: `${a.sign_off_action ?? ''}?`,
                    text: `${d.name} moves to As-is documented, signed with your name; the sign-off covers A as it is now.`,
                    confirm: a.sign_off_action ?? 'Sign off',
                    write: writes.stage(d.portal, d.id, 'as_is_documented', d.rev),
                  })
                }
              >
                {a.sign_off_action}
              </Button>
            )}
            <Field label="Stage">
              <Select value={stage} onChange={(e) => setStage(e.target.value)}>
                {a.stages.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              disabled={stage === d.stage_value}
              onClick={() =>
                ask({
                  title: `Move ${d.name} to ${a.stages.find((o) => o.value === stage)?.label ?? stage}?`,
                  text: 'Every move is signed and shows in History; a process can move back at any time.',
                  confirm: 'Set stage',
                  write: writes.stage(d.portal, d.id, stage, d.rev),
                })
              }
            >
              Set stage
            </Button>
          </Cluster>
        )}
      </Stack>
    </Plate>
  );
}

function Records({ portal, s }: { portal: string; s: ProcessStep }) {
  if (!s.documented)
    return (
      <Text small muted>
        Nothing documented on this screen yet.
      </Text>
    );
  return (
    <Stack>
      {s.records.map((g) => (
        <Cluster key={g.kind}>
          <Text small muted>
            {g.label}
          </Text>
          {g.records.map((r) => (
            <Tag key={r.key} size="sm" href={docHref(portal, r.key)}>
              {r.key}
            </Tag>
          ))}
        </Cluster>
      ))}
    </Stack>
  );
}

interface StepsProps {
  d: ProcessPage;
  ask: (x: Ask) => void;
  select: (step: string) => void;
}

/** A's screens in a new order: a signed revision of A (spec 027 US4.2). */
function editA(d: ProcessPage, states: string[], title: string, text: string): Ask {
  return { title, text, confirm: 'Change A', write: writes.editAsIs(d.portal, d.id, d.model.rev, states) };
}

function StepActions({ d, s, i, ask, select }: StepsProps & { s: ProcessStep; i: number }) {
  const editable = d.model.kind === 'as-is' && !d.archived_at;
  const states = d.steps.map((x) => x.state ?? '');
  const move = (by: number) => {
    const next = [...states];
    const [it] = next.splice(i, 1);
    if (it !== undefined) next.splice(i + by, 0, it);
    return next;
  };
  return (
    <Cluster>
      <Button size="sm" variant="quiet" aria-pressed={d.selected?.id === s.id} onClick={() => select(s.id)}>
        {d.selected?.id === s.id ? 'Selected' : 'Select'}
      </Button>
      {editable && i > 0 && (
        <Button size="sm" variant="quiet" aria-label={`Move step ${String(s.n)} up`} onClick={() => ask(editA(d, move(-1), `Move ${s.title} up?`, 'A gets a new signed revision with the screens in this order.'))}>
          ↑
        </Button>
      )}
      {editable && i < d.steps.length - 1 && (
        <Button size="sm" variant="quiet" aria-label={`Move step ${String(s.n)} down`} onClick={() => ask(editA(d, move(1), `Move ${s.title} down?`, 'A gets a new signed revision with the screens in this order.'))}>
          ↓
        </Button>
      )}
      {editable && d.steps.length > 1 && (
        <Button
          size="sm"
          variant="quiet"
          aria-label={`Remove step ${String(s.n)} from A`}
          onClick={() =>
            ask(editA(d, states.filter((_, j) => j !== i), `Take ${s.title} out of A?`, 'The screen, its scans and its records stay; History can restore this revision.'))
          }
        >
          Remove
        </Button>
      )}
    </Cluster>
  );
}

function AddScreen({ d, ask }: { d: ProcessPage; ask: (x: Ask) => void }) {
  const options = d.as_is?.addable ?? [];
  const [pick, setPick] = useState(options[0]?.value ?? '');
  if (d.model.kind !== 'as-is' || d.archived_at || options.length === 0) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const label = options.find((o) => o.value === pick)?.label ?? pick;
    ask(editA(d, [...d.steps.map((s) => s.state ?? ''), pick], `Add ${label} to A?`, 'It becomes the last step of A, in a new signed revision.'));
  };
  return (
    <form onSubmit={submit} aria-label="Add a screen to A">
      <Cluster>
        <Field label="Add a recorded screen at the end">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button size="sm" type="submit">
          Add screen
        </Button>
      </Cluster>
    </form>
  );
}

/** The model's steps: A as documentation with its pictures and records, a to-be model as drawn steps. */
export function ProcessSteps({ d, ask, select }: StepsProps) {
  const isA = d.model.kind === 'as-is';
  const title = `${d.model.label} · ${isA ? 'As-is' : 'To-be'} r${String(d.model.rev)}`;
  return (
    <Plate title={title} actions={<Text small muted>{isA ? 'Observed screens, documented per step' : 'Read only here; draw it on the htmx page'}</Text>}>
      <Stack>
        <Rows label={`Steps in ${d.model.label}`}>
          {d.steps.map((s, i) => (
            <Row key={s.id} current={d.selected?.id === s.id} {...(s.observed ? {} : { tone: 'dashed' as const })} aside={<StepActions d={d} s={s} i={i} ask={ask} select={select} />}>
              <Cluster>
                {isA && s.state && <Picture size="sm" shot={s.shot} wire={s.wire} title={s.title} route={s.route} scans={s.scans} />}
                <Stack>
                  <Text small muted>{`${String(s.n)}${i === 0 ? ' · Start' : ''}${i === d.steps.length - 1 && i > 0 ? ' · End' : ''}`}</Text>
                  {s.state ? (
                    <Text asIs href={stateHref(s.state)}>
                      {s.title}
                    </Text>
                  ) : (
                    <Text asIs>{s.title}</Text>
                  )}
                  <Text route>{s.route ?? '—'}</Text>
                  {!s.observed && <Text small>Designed, not observed</Text>}
                  {isA && <Records portal={d.portal} s={s} />}
                </Stack>
              </Cluster>
            </Row>
          ))}
        </Rows>
        <AddScreen d={d} ask={ask} />
      </Stack>
    </Plate>
  );
}

/** The side column: the selected step's documentation (A) or what it is built from and its notes (to-be). */
export function SelectedStep({ d }: { d: ProcessPage }) {
  const s = d.selected;
  if (!s)
    return (
      <Plate title="No step selected">
        <Text small muted block>
          {d.model.kind === 'as-is'
            ? 'Select a step to see everything documented on its screen.'
            : 'Select a step to see what it is built from and its annotations.'}
        </Text>
      </Plate>
    );
  return (
    <Plate title={<Text asIs>{s.title}</Text>} actions={<Text small muted>{`Step ${String(s.n)} of ${d.model.label}`}</Text>}>
      <Stack>
        {s.state && <Picture shot={s.shot} wire={s.wire} title={s.title} route={s.route} scans={s.scans} href={stateHref(s.state)} />}
        <Text route>{s.route ?? '—'}</Text>
        {d.model.kind === 'as-is' && (
          <Text small>{`Seen by ${plural(s.scans, 'scan')}${s.amendments ? ` · ${plural(s.amendments, 'amendment')}` : ''}${s.reanchor ? ` · ${String(s.reanchor)} to re-anchor` : ''}`}</Text>
        )}
        {s.built_from.length > 0 && (
          <Stack>
            <SubHead>Built from</SubHead>
            {s.built_from.map((b) => (
              <Text key={b} small asIs>
                {b}
              </Text>
            ))}
          </Stack>
        )}
        {s.records.map((g) => (
          <Stack key={g.kind}>
            <SubHead>{`${g.label} · ${String(g.records.length)}`}</SubHead>
            {g.records.map((r) => (
              <Cluster key={r.key}>
                <Tag size="sm" href={docHref(d.portal, r.key)}>
                  {r.key}
                </Tag>
                <Text asIs>{r.title}</Text>
                {r.status && <ShownStatus status={r.status} />}
              </Cluster>
            ))}
          </Stack>
        ))}
        <Stack>
          <SubHead>Annotations on this step</SubHead>
          {s.annotations.length === 0 ? (
            <Text small muted>
              None yet.
            </Text>
          ) : (
            s.annotations.map((a, i) => (
              <Note key={i} size="sm" by={`${a.author} · ${a.at}`}>
                {a.text}
              </Note>
            ))
          )}
        </Stack>
      </Stack>
    </Plate>
  );
}
