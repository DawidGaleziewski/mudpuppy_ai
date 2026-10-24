// The live Workbench's frame components (spec 075, the R-96 spike): View (the generated view's
// frame), CommandCard (every write; the person's Confirm) and Choice (the assistant's ask_choice:
// a drop-down), all owned by the server; and the record cards. Grey boxes until the designer's look.

import { useState } from 'react';
import { z } from 'zod';
import { CommonSchemas, type ComponentContext } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { useGo } from '../app/RouterAnchor';
import { PersonaCreator } from './PersonaCreator';
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
  ({ props, buildChild, context }) => (
    <section className="wbx-view" aria-label={props.why ? `Generated view: ${props.why}` : 'Live'}>
      <div className="wbx-view__head">
        <span className="wbx-chip">{props.why ? 'generated' : 'server'}</span> {props.path}
        {props.why && <span className="wbx-muted"> · Why: {props.why}</span>}
      </div>
      {(Array.isArray(props.children) ? props.children : []).map((c) => (
        <div key={childId(c)}>{buildChild(childId(c))}</div>
      ))}
      {props.suggestions && props.suggestions.length > 0 && (
        <div className="wbx-actions">
          {props.suggestions.map(childId).map((s) => (
            <button key={s} type="button" onClick={() => act(context, 'suggestion.send', { text: s })}>
              {s}
            </button>
          ))}
        </div>
      )}
    </section>
  ),
);

function StartAs({ card, onConfirm }: { card: LiveCommand; onConfirm: (persona: string) => void }) {
  const [persona, setPersona] = useState(card.persona ?? card.personas[0] ?? '');
  if (card.personas.length === 0) return <p className="wbx-error">This portal has no persona yet: add one first.</p>;
  return (
    <div className="wbx-actions">
      <label className="wbx-field wbx-field--inline">
        <span>As</span>
        <select value={persona} onChange={(e) => setPersona(e.target.value)}>
          {card.personas.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onConfirm(persona)}>
        Confirm
      </button>
    </div>
  );
}

function Proposed({ card, context, id }: { card: LiveCommand; context: ComponentContext; id: string }) {
  const confirm = (extra: Record<string, unknown> = {}) => act(context, 'command.confirm', { command: id, ...extra });
  const cancel = () => act(context, 'command.cancel', { command: id });
  if (card.editable) return <PersonaCreator card={card} onConfirm={(args) => confirm({ args })} onCancel={cancel} />;
  return (
    <>
      {card.askPersona ? (
        <StartAs card={card} onConfirm={(persona) => confirm({ persona })} />
      ) : (
        <div className="wbx-actions">
          <button type="button" onClick={() => confirm()}>
            Confirm
          </button>
        </div>
      )}
      <button type="button" onClick={cancel}>
        Cancel
      </button>
    </>
  );
}

export const CommandCard = createComponentImplementation(
  { name: 'CommandCard', schema: z.object({ command: z.string(), data: CommonSchemas.DynamicValue.optional() }) },
  ({ props, context }) => {
    const card = props.data as LiveCommand | undefined;
    if (!card) return null;
    const id = context.componentModel.id;
    return (
      <section className="wbx-box wbx-box--command" data-state={card.state} aria-label={`Command: ${card.label}`}>
        <div className="wbx-box__title">
          {card.label} · <strong>{card.state}</strong>
        </div>
        {card.reason && <p className="wbx-muted">Because {card.reason}</p>}
        <dl className="wbx-facts">
          {card.facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {card.state === 'proposed' && <Proposed card={card} context={context} id={id} />}
        {card.state === 'running' && <p>{card.running}</p>}
        {card.result && <p>{card.result}</p>}
        {card.error && (
          <p className="wbx-error">
            {card.error} {card.errorRef && <code>{card.errorRef}</code>}
          </p>
        )}
        {card.undo && (
          <button type="button" onClick={() => act(context, 'command.undo', { command: id })}>
            Undo
          </button>
        )}
      </section>
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
      <section className="wbx-box wbx-box--choice" aria-label={choice.question}>
        <div className="wbx-box__title">{choice.question}</div>
        {choice.answer ? (
          <p>You answered: {choice.answer}</p>
        ) : (
          <div className="wbx-actions">
            <select aria-label={choice.question} value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Choose…</option>
              {choice.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" disabled={!picked} onClick={send}>
              {choice.kind === 'portal' || choice.kind === 'store' ? 'Switch' : 'Send'}
            </button>
          </div>
        )}
      </section>
    );
  },
);

const Record = z.object({ record: z.string().optional(), records: z.array(z.string()).optional(), title: z.string().optional(), data: CommonSchemas.DynamicValue.optional() });

export const RecordCard = createComponentImplementation({ name: 'RecordCard', schema: Record }, ({ props }) => <div className="wbx-box">Record {props.record}</div>);

export const RecordList = createComponentImplementation({ name: 'RecordList', schema: Record }, ({ props }) => (
  <div className="wbx-box">
    {props.title ?? 'Records'}: {(props.records ?? []).map(childId).join(', ')}
  </div>
));
