import { useState, type FormEvent } from 'react';
import { Button, Cluster, Field, Input, Note, Picture, Plate, Stack, SubHead, Tag, Text, Textarea } from '../design-system';
import { docHref, type ProcessPage, type ProcessStep } from '../app/api-process';
import { ShownStatus } from '../app/ShownStatus';
import { plural } from '../app/plural';
import { stepOps } from '../app/stepOps';
import type { Draft } from '../app/useDraft';
import { stateHref } from './RecordedInspector';

/** Change the selected step's title or route (it becomes a designed step), or remove it. */
function ChangeStep({ s, draft, label }: { s: ProcessStep; draft: Draft; label: string }) {
  const [title, setTitle] = useState(s.title);
  const [route, setRoute] = useState(s.route ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) draft.apply((st) => stepOps.edit(st, s.id, { title: title.trim(), route: route.trim() }));
  };
  return (
    <Stack>
      <form onSubmit={submit} aria-label="Change this step">
        <Stack>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Route" help="A changed observed step becomes a designed one.">
            <Input value={route} onChange={(e) => setRoute(e.target.value)} maxLength={500} autoComplete="off" spellCheck={false} />
          </Field>
          <Cluster>
            <Button size="sm" type="submit">
              Change step
            </Button>
          </Cluster>
        </Stack>
      </form>
      <Cluster>
        <Button size="md" variant="danger" onClick={() => draft.apply((st) => stepOps.remove(st, s.id))}>
          {`Remove step from ${label}`}
        </Button>
      </Cluster>
    </Stack>
  );
}

function Annotate({ s, draft, author }: { s: ProcessStep; draft: Draft; author: string }) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    draft.apply((st) => stepOps.annotate(st, s.id, text.trim(), author));
    setText('');
  };
  return (
    <form onSubmit={submit} aria-label="Add an annotation">
      <Stack>
        <Field label="New annotation">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={5000} placeholder="What should be different here, and why" />
        </Field>
        <Cluster>
          <Button size="sm" variant="strong" type="submit">
            Add annotation
          </Button>
        </Cluster>
      </Stack>
    </form>
  );
}

function Documentation({ d, s }: { d: ProcessPage; s: ProcessStep }) {
  return (
    <>
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
    </>
  );
}

/** The side column: the selected step's documentation (A), or what it is built from, its annotations and its edits (to-be). */
export function SelectedStep({ d, draft }: { d: ProcessPage; draft: Draft }) {
  const s = d.selected;
  if (!s)
    return (
      <Plate title="No step selected">
        <Text small muted block>
          {d.model.kind === 'as-is'
            ? 'Select a step to see everything documented on its screen.'
            : `Select a step to see what it is built from and its annotations${draft.editable ? ', or to change it' : ''}.`}
        </Text>
      </Plate>
    );
  const author = d.editor?.author ?? '';
  return (
    <Plate title={<Text asIs>{s.title}</Text>} actions={<Text small muted>{`Step ${String(s.n)} of ${d.model.label}`}</Text>}>
      <Stack key={s.id}>
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
        <Documentation d={d} s={s} />
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
          {draft.editable && <Annotate s={s} draft={draft} author={author} />}
        </Stack>
        {draft.editable && <ChangeStep s={s} draft={draft} label={d.model.label} />}
      </Stack>
    </Plate>
  );
}
