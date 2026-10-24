import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Cluster, Disclosure, Field, Input, Note, Plate, Select, Stack, SubHead, Tag, Text, Textarea, Timeline, TimelineItem } from '../design-system';
import { amendmentWrites, type Amendment, type Amendments as AmendmentList } from '../app/api-state';
import type { Ask } from '../app/ConfirmedWrite';
import { ShownStatus } from '../app/ShownStatus';

const reviewHref = (portal: string) => `/app/portals/${encodeURIComponent(portal)}/review?show=reanchor`;

/** A file as base64, for the amendment's attachment (the chat service stores it). */
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? (reader.result.split(',', 2)[1] ?? '') : '');
    reader.onerror = () => reject(new Error('The attachment could not be read.'));
    reader.readAsDataURL(file);
  });
}

function Edit({ portal, a, ask }: { portal: string; a: Amendment; ask: (x: Ask) => void }) {
  const [text, setText] = useState(a.text ?? '');
  return (
    <Disclosure summary="Edit (new revision)">
      <Stack>
        <Field label="New wording">
          <Textarea rows={3} maxLength={50000} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Cluster>
          <Button
            size="sm"
            disabled={!text.trim()}
            onClick={() =>
              ask({
                title: `Save ${a.key} as r${String(a.rev + 1)}?`,
                text: 'The new wording becomes the next revision; the earlier ones stay in its history.',
                confirm: `Save as r${String(a.rev + 1)}`,
                write: amendmentWrites.edit(portal, a.id, text.trim(), a.rev),
              })
            }
          >
            {`Save as r${String(a.rev + 1)}`}
          </Button>
        </Cluster>
      </Stack>
    </Disclosure>
  );
}

function Item({ portal, a, ask }: { portal: string; a: Amendment; ask: (x: Ask) => void }) {
  return (
    <Stack>
      <Cluster>
        <Tag size="sm">{`${a.key} r${String(a.rev)}`}</Tag>
        <ShownStatus status={a.status} />
      </Cluster>
      {a.text ? <Note size="sm" by={`${a.author} · ${a.created_at}`}>{a.text}</Note> : <Text small muted>{`By ${a.author} · ${a.created_at}`}</Text>}
      {a.attachment && <Text small>{`Attachment ${a.attachment}`}</Text>}
      <Text small muted>{a.element ? `On element ${a.element}` : 'Whole screen'}</Text>
      {a.history.length > 1 && (
        <Disclosure summary={`${String(a.history.length)} revisions`}>
          <Timeline>
            {[...a.history].reverse().map((h, i) => (
              <TimelineItem key={h.rev} {...(i === 0 ? { status: 'ok' as const } : {})} head={<Cluster><Tag size="sm">{`${a.key} r${String(h.rev)}`}</Tag><Text small muted>{h.change}</Text></Cluster>}>
                <Text small>{`${h.text ? `${h.text} · ` : ''}${h.author} · ${h.created_at}`}</Text>
              </TimelineItem>
            ))}
          </Timeline>
        </Disclosure>
      )}
      {a.state === 'active' && (
        <Cluster>
          <Edit portal={portal} a={a} ask={ask} />
          <Button
            size="sm"
            variant="quiet"
            onClick={() =>
              ask({ title: `Withdraw ${a.key}?`, text: 'It stays in the history, no longer active.', confirm: 'Withdraw', write: amendmentWrites.withdraw(portal, a.id) })
            }
          >
            Withdraw
          </Button>
        </Cluster>
      )}
      {a.state === 'needs_reanchor' && <Text small href={reviewHref(portal)}>Re-anchor in Review</Text>}
    </Stack>
  );
}

interface AddValues {
  element: string;
  text: string;
  /** The input's files (React Hook Form keeps a file input's FileList). */
  files: FileList | null;
}

const AddSchema = z
  .object({ element: z.string(), text: z.string().max(50000), files: z.custom<FileList | null>() })
  .refine((v) => v.text.trim() !== '' || (v.files?.length ?? 0) > 0, { path: ['text'], message: 'A note or an attachment.' });

/** Add an amendment (React Hook Form, spec 076): an element or the whole screen, a note, an attachment. */
function AddForm({ portal, state, elements, ask }: { portal: string; state: string; elements: [string, string][]; ask: (x: Ask) => void }) {
  const form = useForm<AddValues>({ defaultValues: { element: '', text: '', files: null }, resolver: zodResolver(AddSchema) });
  const [text, files] = useWatch({ control: form.control, name: ['text', 'files'] });
  const fileError = form.formState.errors.files?.message;
  const add = form.handleSubmit(async ({ element, text: note, files: picked }) => {
    const file = picked?.[0];
    let attachment: { name: string; content_base64: string } | undefined;
    try {
      if (file) attachment = { name: file.name, content_base64: await readFile(file) };
    } catch (e) {
      form.setError('files', { message: e instanceof Error ? e.message : 'The attachment could not be read.' });
      return;
    }
    ask({
      title: 'Add the amendment?',
      text: `It is written on ${element ? `the element ${element}` : 'the whole screen'}, kept apart from how the screen works today.`,
      confirm: 'Add amendment',
      write: amendmentWrites.add(portal, { state_id: state, element, text: note.trim(), ...(attachment ? { attachment } : {}) }),
      onDone: () => form.reset({ element, text: '', files: null }),
    });
  });
  return (
    <form onSubmit={(e) => void add(e)} aria-label="Add an amendment">
      <Stack>
        <SubHead>Add an amendment</SubHead>
        <Field label="Applies to" help={elements.length ? undefined : 'No wireframe layout is recorded for this screen, so only the whole screen can be amended.'}>
          <Select {...form.register('element')}>
            <option value="">The whole screen</option>
            {elements.map(([key, label]) => (
              <option key={key} value={key}>{`${label} · ${key}`}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note">
          <Textarea rows={3} maxLength={50000} placeholder="What should be different, and why" {...form.register('text')} />
        </Field>
        <Field label="Attachment" help="Optional, up to 8 MB." {...(fileError ? { error: fileError } : {})}>
          <Input type="file" {...form.register('files')} />
        </Field>
        <Cluster>
          <Button type="submit" variant="primary" disabled={!text.trim() && !files?.length}>
            Add amendment
          </Button>
        </Cluster>
      </Stack>
    </form>
  );
}

/**
 * The screen's to-be amendments (designer Q10: they belong to the screen, not one visit): every
 * one with its revisions, editable as new revisions, and the add form on the newest variant.
 */
export function ScreenAmendments({ portal, state, list, canMark, ask }: { portal: string; state: string; list: AmendmentList; canMark: boolean; ask: (x: Ask) => void }) {
  return (
    <Plate variant="drawn" label="Amendments">
      <Stack>
        <Text small muted>To-be: what the business wants changed. Kept apart from how the screen works today.</Text>
        {list.items.length === 0 ? (
          <Text small muted>No amendments on this screen. Add the change you want below; it is kept apart from what was observed.</Text>
        ) : (
          list.items.map((a) => <Item key={a.id} portal={portal} a={a} ask={ask} />)
        )}
        {canMark ? <AddForm portal={portal} state={state} elements={list.elements} ask={ask} /> : <Text small muted>Set MUDPUPPY_REVIEWER to your name to add amendments.</Text>}
      </Stack>
    </Plate>
  );
}
