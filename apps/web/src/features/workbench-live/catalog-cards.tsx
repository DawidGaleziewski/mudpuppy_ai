// The live Workbench's frame components (spec 075, the R-96 spike): View (the generated view's
// frame), CommandCard (every write; the person's Confirm) and Choice (the assistant's ask_choice:
// a drop-down), all owned by the server; and the record cards. Drawn with the design system's own
// parts (spec 076): GenView, CommandCard, Plate, Field, Select, Button.

import { useId, useState } from 'react';
import { z } from 'zod';
import { CommonSchemas, type ComponentContext } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { Button, Cluster, CommandCard as CommandCardView, Field, GenView, Plate, Select, Stack, Suggestions, Tag, Text } from '../../design-system';
import { docHref } from '../../app/api-process';
import { useGo } from '../../app/RouterAnchor';
import { useLiveFrame } from './context';
import { PersonaCommand } from './PersonaCreator';
import type { LiveChoice, LiveCommand } from './protocol';

const act = (context: ComponentContext, name: string, payload: Record<string, unknown>): void =>
  void context.dispatchAction({ event: { name, context: payload } });

const childId = (c: unknown): string => (typeof c === 'string' ? c : String((c as { id?: unknown }).id));

export const View = createComponentImplementation(
  {
    name: 'View',
    schema: z.object({
      path: z.string(),
      why: z.string().optional(),
      children: CommonSchemas.ChildList,
      suggestions: z.array(z.string()).optional(),
      data: CommonSchemas.DynamicValue.optional(),
    }),
  },
  ({ props, buildChild, context }) => {
    const frameId = useId();
    const children = (Array.isArray(props.children) ? props.children : []).map(childId).map((id) => <div key={id}>{buildChild(id)}</div>);
    const suggestions = (props.suggestions ?? []).map(childId);
    // a view without a reason is the server's own (a command card, a choice, the stage): no "generated" mark
    if (!props.why) return <Stack>{children}</Stack>;
    return (
      <GenView id={frameId} title={props.path} source="Live · from the store" card>
        <Stack>
          <Text small muted>{`Why: ${props.why}`}</Text>
          {children}
          {suggestions.length > 0 && <Suggestions items={suggestions} onPick={(text) => act(context, 'suggestion.send', { text })} />}
        </Stack>
      </GenView>
    );
  },
);

export const CommandCard = createComponentImplementation(
  { name: 'CommandCard', schema: z.object({ command: z.string(), data: CommonSchemas.DynamicValue.optional() }) },
  ({ props, context }) => {
    const card = props.data as LiveCommand | undefined;
    if (!card) return null;
    const id = context.componentModel.id;
    const confirm = (extra: Record<string, unknown> = {}) => act(context, 'command.confirm', { command: id, ...extra });
    const cancel = () => act(context, 'command.cancel', { command: id });
    if (card.editable) return <PersonaCommand card={card} onConfirm={(args) => confirm({ args })} onCancel={cancel} onUndo={() => act(context, 'command.undo', { command: id })} />;
    return (
      <CommandCardView
        title={card.label}
        state={card.state}
        status={card.shown.shape ? { status: card.shown.shape, children: card.shown.word } : null}
        facts={card.facts}
        reason={card.reason}
        personas={card.personas}
        persona={card.persona}
        askPersona={card.askPersona}
        runningWord={card.running}
        result={card.result}
        error={card.error ?? ''}
        errorRef={card.errorRef}
        onConfirm={(persona) => confirm(persona ? { persona } : {})}
        onCancel={cancel}
        {...(card.notStarted ? { notStarted: { ...(!card.startedAgain && { onAgain: () => act(context, 'command.again', { command: id }) }), ...(card.check && { check: card.check }) } } : {})}
      />
    );
  },
);

/** A pick of another portal or store moves the page there as well as telling the assistant. */
function hrefOf(choice: LiveChoice, value: string): string | null {
  if (choice.kind === 'portal') return `/app/portals/${encodeURIComponent(value)}/workbench/live`;
  // another store holds other conversations: its Live page starts fresh there
  if (choice.kind !== 'store') return null;
  return `${window.location.pathname}?store=${encodeURIComponent(value)}`;
}

export const Choice = createComponentImplementation(
  { name: 'Choice', schema: z.object({ data: CommonSchemas.DynamicValue.optional() }) },
  ({ props, context }) => {
    const choice = props.data as LiveChoice | undefined;
    const [value, setValue] = useState('');
    const go = useGo();
    if (!choice) return null;
    const picked = choice.options.find((o) => o.value === value);
    const send = () => {
      if (!picked) return;
      act(context, 'choice.answer', { choice: context.componentModel.id, value: picked.value, label: picked.label });
      const href = hrefOf(choice, picked.value);
      if (href) go(href);
    };
    return (
      <Plate title={choice.question} label={choice.question}>
        {choice.answer ? (
          <Text>{`You answered: ${choice.answer}`}</Text>
        ) : (
          <Cluster>
            <Field label={choice.question}>
              <Select value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Choose…</option>
                {choice.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button size="sm" variant="strong" disabled={!picked} onClick={send}>
              {choice.kind === 'portal' || choice.kind === 'store' ? 'Switch' : 'Send'}
            </Button>
          </Cluster>
        )}
      </Plate>
    );
  },
);

const Record = z.object({ record: z.string().optional(), records: z.array(z.string()).optional(), title: z.string().optional(), data: CommonSchemas.DynamicValue.optional() });

/** A record's key as a manila tag that opens it in Docs (designer 16 § 4.14). */
function RecordTag({ record }: { record: string }) {
  const portal = useLiveFrame().state?.portal.id;
  return portal ? (
    <Tag size="sm" href={docHref(portal, record)}>
      {record}
    </Tag>
  ) : (
    <Tag size="sm">{record}</Tag>
  );
}

export const RecordCard = createComponentImplementation({ name: 'RecordCard', schema: Record }, ({ props }) =>
  props.record ? (
    <Cluster>
      <RecordTag record={props.record} />
      {props.title && <Text small>{props.title}</Text>}
    </Cluster>
  ) : null,
);

/** Records as tags under their title (designer 16 § 4.15). */
export const RecordList = createComponentImplementation({ name: 'RecordList', schema: Record }, ({ props }) => (
  <Stack>
    <Text small strong>
      {props.title ?? 'Records'}
    </Text>
    <Cluster>
      {(props.records ?? []).map(childId).map((r) => (
        <RecordTag key={r} record={r} />
      ))}
    </Cluster>
  </Stack>
));
