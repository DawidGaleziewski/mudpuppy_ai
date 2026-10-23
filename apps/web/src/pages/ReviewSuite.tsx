import { useState } from 'react';
import { Button, Check, Cluster, Disclosure, Field, Fieldset, Input, Select, Stack, Table, Text } from '../design-system';
import { reviewWrites, type SuiteDetail, type SuiteEdit, type SuiteStep } from '../app/api-review';
import type { Ask } from '../app/ConfirmedWrite';

type EditStep = SuiteStep & { drop?: boolean };
type EditVariant = SuiteEdit['variants'][number];

const firstEdit = (d: SuiteDetail): SuiteEdit => ({
  variants: d.variants.map((v) => ({ id: v.id, keep: true, expect: v.expect, steps: v.steps.map((s) => ({ ...s })) })),
  new: { id: '', from: d.variants[0]?.id ?? '', expect: 'proceed' },
});

const DONE_ASK = {
  approve: { title: 'Approve the suite?', text: 'Your changes are saved first; then it is written into', confirm: 'Approve' },
  save: { title: 'Save the changes?', text: 'The suite keeps waiting for approval in', confirm: 'Save' },
  dismiss: { title: 'Dismiss the suite?', text: 'It leaves Review and is never written into', confirm: 'Dismiss' },
} as const;

interface StepsProps {
  v: EditVariant;
  kinds: SuiteDetail['kinds'];
  change: (steps: EditStep[]) => void;
}

/** A variant's steps in order: what each does, on which field or control, with which value; drop one or add one. */
function Steps({ v, kinds, change }: StepsProps) {
  const set = (i: number, patch: Partial<EditStep>) => change(v.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const rows = v.steps.map((s, i) => ({ s, i }));
  return (
    <Disclosure summary={`Steps · ${String(v.steps.filter((s) => !s.drop).length)}`}>
      <Stack>
        <Table
          caption={`Steps of ${v.id}, in order`}
          columns={[
            {
              header: 'Do',
              cell: ({ s, i }) => (
                <Select aria-label={`What step ${String(i + 1)} does`} value={s.kind} onChange={(e) => set(i, { kind: e.target.value })}>
                  {kinds.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              ),
            },
            { header: 'Field or control', cell: ({ s, i }) => <Input aria-label={`Field or control of step ${String(i + 1)}`} value={s.name} onChange={(e) => set(i, { name: e.target.value })} /> },
            { header: 'Value', cell: ({ s, i }) => <Input aria-label={`Value of step ${String(i + 1)}`} value={s.value} onChange={(e) => set(i, { value: e.target.value })} /> },
            { header: 'Drop', cell: ({ s, i }) => <Check label={<Text small>Drop</Text>} aria-label={`Drop step ${String(i + 1)}`} checked={s.drop === true} onChange={(e) => set(i, { drop: e.target.checked })} /> },
          ]}
          rows={rows}
          rowKey={({ i }) => String(i)}
          dense
        />
        <Cluster>
          <Button size="sm" onClick={() => change([...v.steps, { kind: 'fill', name: '', value: '' }])}>
            Add a step
          </Button>
        </Cluster>
      </Stack>
    </Disclosure>
  );
}

function NewVariant({ d, edit, setEdit }: { d: SuiteDetail; edit: SuiteEdit; setEdit: (e: SuiteEdit) => void }) {
  const set = (patch: Partial<SuiteEdit['new']>) => setEdit({ ...edit, new: { ...edit.new, ...patch } });
  return (
    <Fieldset legend="Add a variant">
      <Text small muted>
        Copies the steps of an existing variant; save, then edit its steps.
      </Text>
      <Field label="Id (lowercase, dashes)">
        <Input value={edit.new.id} pattern="[a-z][a-z0-9-]*" onChange={(e) => set({ id: e.target.value })} />
      </Field>
      <Field label="Copy the steps of">
        <Select value={edit.new.from} onChange={(e) => set({ from: e.target.value })}>
          {d.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Expected">
        <Select drawn value={edit.new.expect} onChange={(e) => set({ expect: e.target.value })}>
          {d.expects.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    </Fieldset>
  );
}

/** A probe suite the BA proposed: keep or drop variants, change what each expects, edit steps, then approve, save or dismiss. */
export function Suite({ portal, d, decides, ask }: { portal: string; d: SuiteDetail; decides: boolean; ask: (a: Ask) => void }) {
  const [edit, setEdit] = useState<SuiteEdit>(() => firstEdit(d));
  const setVariant = (i: number, patch: Partial<EditVariant>) =>
    setEdit({ ...edit, variants: edit.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const send = (action: keyof typeof DONE_ASK) =>
    ask({ title: DONE_ASK[action].title, text: `${DONE_ASK[action].text} ${d.traces_file}.`, confirm: DONE_ASK[action].confirm, write: reviewWrites.suite(portal, d.id, action, edit) });
  return (
    <Stack>
      <Text small block>
        {d.goal}
      </Text>
      <Cluster>
        <Text small muted>
          Starts at
        </Text>
        <Text route>{d.start_url}</Text>
        {d.step_label && <Text small muted asIs>{`form step ${d.step_label}`}</Text>}
        <Text mono small muted>
          {d.trace_id}
        </Text>
      </Cluster>
      {!decides ? null : (
        <Stack>
          {edit.variants.map((v, i) => {
            const facts = d.variants[i];
            return (
              <Fieldset key={v.id} legend={v.id}>
                <Stack>
                  <Cluster>
                    <Check label="Run every time" checked={v.keep} onChange={(e) => setVariant(i, { keep: e.target.checked })} />
                    {facts?.probe && <Text small muted>{facts.probe}</Text>}
                    {facts?.fault && <Text small muted>{`fault ${facts.fault.replaceAll('_', ' ')}`}</Text>}
                  </Cluster>
                  {facts?.why && <Text small block>{facts.why}</Text>}
                  <Field label="Expected">
                    <Select drawn value={v.expect} onChange={(e) => setVariant(i, { expect: e.target.value })}>
                      {d.expects.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Steps v={v} kinds={d.kinds} change={(steps) => setVariant(i, { steps })} />
                </Stack>
              </Fieldset>
            );
          })}
          <NewVariant d={d} edit={edit} setEdit={setEdit} />
          <Text small muted block>
            Approving writes the trace into <Text mono>{d.traces_file}</Text>; run it with <Text mono>{d.run_command}</Text>.
          </Text>
          <Cluster>
            <Button variant="strong" size="md" onClick={() => send('approve')}>
              Approve the suite
            </Button>
            <Button size="md" onClick={() => send('save')}>
              Save changes
            </Button>
            <Button size="md" variant="quiet" onClick={() => send('dismiss')}>
              Dismiss
            </Button>
          </Cluster>
        </Stack>
      )}
    </Stack>
  );
}
