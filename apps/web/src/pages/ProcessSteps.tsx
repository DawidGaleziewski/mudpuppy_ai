import { useState, type FormEvent } from 'react';
import { Button, Cluster, Field, Input, Picture, Plate, Row, Rows, Select, Stack, Tag, Text } from '../design-system';
import { docHref, type ProcessPage, type ProcessStep } from '../app/api-process';
import { writes } from '../app/api-write';
import type { Ask } from '../app/ConfirmedWrite';
import { ShownStatus } from '../app/ShownStatus';
import { stepOps } from '../app/stepOps';
import type { Draft } from '../app/useDraft';
import { titleError, useStepForm } from '../app/useStepForm';
import { stateHref } from './RecordedInspector';

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
  draft: Draft;
}

/** A's screens in a new order: a signed revision of A (spec 027 US4.2). */
function editA(d: ProcessPage, states: string[], title: string, text: string): Ask {
  return { title, text, confirm: 'Change A', write: writes.editAsIs(d.portal, d.id, d.model.rev, states) };
}

/** On A: reorder or remove its screens, each a signed revision after a confirm. */
function AsIsActions({ d, s, i, ask }: StepsProps & { s: ProcessStep; i: number }) {
  if (d.archived_at) return null;
  const states = d.steps.map((x) => x.state ?? '');
  const move = (by: number) => {
    const next = [...states];
    const [it] = next.splice(i, 1);
    if (it !== undefined) next.splice(i + by, 0, it);
    return next;
  };
  const text = 'A gets a new signed revision with the screens in this order.';
  return (
    <>
      {i > 0 && (
        <Button size="sm" variant="quiet" aria-label={`Move step ${String(s.n)} up`} onClick={() => ask(editA(d, move(-1), `Move ${s.title} up?`, text))}>
          ↑
        </Button>
      )}
      {i < d.steps.length - 1 && (
        <Button size="sm" variant="quiet" aria-label={`Move step ${String(s.n)} down`} onClick={() => ask(editA(d, move(1), `Move ${s.title} down?`, text))}>
          ↓
        </Button>
      )}
      {d.steps.length > 1 && (
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
    </>
  );
}

/** On a to-be model: reorder or merge in the person's draft (autosaved, spec 059 D-1). */
function ToBeActions({ d, s, i, draft }: StepsProps & { s: ProcessStep; i: number }) {
  if (!draft.editable) return null;
  return (
    <>
      {i > 0 && (
        <Button size="sm" variant="quiet" aria-label={`Move step ${String(s.n)} up`} onClick={() => draft.apply((st) => stepOps.up(st, s.id))}>
          ↑
        </Button>
      )}
      {i < d.steps.length - 1 && (
        <>
          <Button size="sm" variant="quiet" aria-label={`Move step ${String(s.n)} down`} onClick={() => draft.apply((st) => stepOps.down(st, s.id))}>
            ↓
          </Button>
          <Button size="sm" variant="quiet" aria-label={`Merge step ${String(s.n)} with the next`} onClick={() => draft.apply((st) => stepOps.merge(st, s.id))}>
            Merge →
          </Button>
        </>
      )}
    </>
  );
}

function StepActions(p: StepsProps & { s: ProcessStep; i: number }) {
  const { d, s, select } = p;
  return (
    <Cluster>
      <Button size="sm" variant="quiet" aria-pressed={d.selected?.id === s.id} onClick={() => select(s.id)}>
        {d.selected?.id === s.id ? 'Selected' : 'Select'}
      </Button>
      {d.model.kind === 'as-is' ? <AsIsActions {...p} /> : <ToBeActions {...p} />}
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

/** + Add step: a designed step at the end of the person's draft. */
function AddStep({ draft }: { draft: Draft }) {
  const form = useStepForm({ title: '', route: '' });
  if (!draft.editable) return null;
  const submit = form.handleSubmit((step) => {
    draft.apply((st) => stepOps.add(st, step));
    form.reset();
  });
  return (
    <form onSubmit={(e) => void submit(e)} aria-label="Add a step at the end">
      <Cluster>
        <Field label="New step" {...titleError(form)}>
          <Input required maxLength={200} autoComplete="off" {...form.register('title')} />
        </Field>
        <Field label="Route">
          <Input maxLength={500} placeholder="/…" autoComplete="off" spellCheck={false} {...form.register('route')} />
        </Field>
        <Button size="sm" type="submit">
          + Add step
        </Button>
      </Cluster>
    </form>
  );
}

function StepBody({ d, s, i }: { d: ProcessPage; s: ProcessStep; i: number }) {
  const isA = d.model.kind === 'as-is';
  const change = d.editor?.changes[s.id];
  return (
    <Cluster>
      {isA && s.state && <Picture size="sm" shot={s.shot} wire={s.wire} title={s.title} route={s.route} scans={s.scans} />}
      <Stack>
        <Cluster>
          <Text small muted>{`${String(s.n)}${i === 0 ? ' · Start' : ''}${i === d.steps.length - 1 && i > 0 ? ' · End' : ''}`}</Text>
          {change && <ShownStatus status={change} />}
        </Cluster>
        {s.state ? (
          <Text asIs href={stateHref(s.state)}>
            {s.title}
          </Text>
        ) : (
          <Text asIs>{s.title}</Text>
        )}
        <Text route>{`${s.route ?? '—'}${s.built_from.length > 1 ? ` · merges ${String(s.built_from.length)} steps` : ''}`}</Text>
        {!s.observed && <Text small>Designed, not observed</Text>}
        {s.annotations.length > 0 && <Text small>{`${String(s.annotations.length)} annotation${s.annotations.length === 1 ? '' : 's'}`}</Text>}
        {isA && <Records portal={d.portal} s={s} />}
      </Stack>
    </Cluster>
  );
}

/** The model's steps: A as documentation with its pictures and records, a to-be model as the person's draft. */
export function ProcessSteps(p: StepsProps) {
  const { d } = p;
  const isA = d.model.kind === 'as-is';
  const draftNote = d.editor?.draft ? ' (draft)' : '';
  const title = `${d.model.label} · ${isA ? 'As-is' : 'To-be'} r${String(d.model.rev)}${draftNote}`;
  let hint = 'Observed screens, documented per step';
  if (!isA) hint = p.draft.editable ? 'Steps you can edit, reorder or remove' : 'Read only';
  return (
    <Plate title={title} actions={<Text small muted>{hint}</Text>}>
      <Stack>
        <Rows label={`Steps in ${d.model.label}`}>
          {d.steps.map((s, i) => (
            <Row key={s.id} current={d.selected?.id === s.id} {...(s.observed ? {} : { tone: 'dashed' as const })} aside={<StepActions {...p} s={s} i={i} />}>
              <StepBody d={d} s={s} i={i} />
            </Row>
          ))}
        </Rows>
        {d.editor && d.editor.removed.length > 0 && (
          <Cluster>
            <Text small muted>
              Removed from the model it was drawn from
            </Text>
            {d.editor.removed.map((r) => (
              <Text key={r} small mono>
                {r}
              </Text>
            ))}
          </Cluster>
        )}
        <AddScreen d={d} ask={p.ask} />
        {!isA && <AddStep draft={p.draft} />}
      </Stack>
    </Plate>
  );
}

/** A's steps beside a to-be model, for reference. */
export function AsIsReference({ d }: { d: ProcessPage }) {
  if (!d.editor) return null;
  const a = d.models.find((m) => m.kind === 'as-is');
  return (
    <Plate title={`A · As-is r${String(a?.rev ?? 1)}`} actions={<Text small muted>For reference</Text>}>
      <Stack>
        {d.editor.as_is.map((line) => (
          <Text key={line} small muted>
            {line}
          </Text>
        ))}
      </Stack>
    </Plate>
  );
}
