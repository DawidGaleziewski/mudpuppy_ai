import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Check, Cluster, Columns, Field, Fieldset, Input, Picture, Row, Rows, Stack, SubHead, Text } from '../design-system';
import type { LooseScreen } from '../app/api-processes';
import { writes } from '../app/api-write';
import type { Ask } from '../app/ConfirmedWrite';

/** Move the item at `i` by `by` places (−1 up, +1 down). */
function moved<T>(items: readonly T[], i: number, by: number): T[] {
  const out = [...items];
  const [it] = out.splice(i, 1);
  if (it !== undefined) out.splice(i + by, 0, it);
  return out;
}

function Picked({ picked, byId, set }: { picked: readonly string[]; byId: Map<string, LooseScreen>; set: (p: string[]) => void }) {
  return (
    <Stack>
      <SubHead>{`Steps of the new process · ${String(picked.length)}`}</SubHead>
      {picked.length === 0 ? (
        <Text small muted block>
          Ticked screens appear here as numbered steps; move them with ↑ and ↓.
        </Text>
      ) : (
        <Rows label="Steps of the new process">
          {picked.map((id, i) => {
            const s = byId.get(id);
            const title = s?.title || s?.route || id;
            return (
              <Row
                key={id}
                aside={
                  <Cluster>
                    <Button size="sm" variant="quiet" aria-label={`Move ${title} up`} disabled={i === 0} onClick={() => set(moved(picked, i, -1))}>
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      aria-label={`Move ${title} down`}
                      disabled={i === picked.length - 1}
                      onClick={() => set(moved(picked, i, 1))}
                    >
                      ↓
                    </Button>
                    <Button size="sm" variant="quiet" aria-label={`Remove ${title}`} onClick={() => set(picked.filter((p) => p !== id))}>
                      Remove
                    </Button>
                  </Cluster>
                }
              >
                <Text small asIs>{`${String(i + 1)} · ${title}`}</Text> <Text route>{s?.route ?? ''}</Text>
              </Row>
            );
          })}
        </Rows>
      )}
    </Stack>
  );
}

const NewProcessSchema = z.object({
  name: z.string().trim().min(1).max(200),
  who: z.string().max(200),
  picked: z.array(z.string()).min(1),
});
type NewProcessValues = z.infer<typeof NewProcessSchema>;

/**
 * A new process from the screens in no process: name it, give its persona, tick the screens in
 * the order a person walks them (they become numbered steps you can reorder), then make it.
 * One React Hook Form (spec 076): the steps are a form value, kept in the order ticked.
 */
export function NewProcess({ portal, loose, persona, ask }: { portal: string; loose: readonly LooseScreen[]; persona: string; ask: (a: Ask) => void }) {
  const form = useForm<NewProcessValues>({ defaultValues: { name: '', who: persona, picked: [] }, resolver: zodResolver(NewProcessSchema) });
  const [name, picked] = useWatch({ control: form.control, name: ['name', 'picked'] });
  const setPicked = (p: string[]) => form.setValue('picked', p);
  const byId = new Map(loose.map((s) => [s.state, s]));
  const submit = form.handleSubmit((v) => {
    const who = v.who.trim() || persona;
    ask({
      title: `Make ${v.name}?`,
      text: `A new process as ${who}, with ${String(v.picked.length)} screen${v.picked.length === 1 ? '' : 's'} as its as-is model A, in the order shown.`,
      confirm: 'Make the process',
      write: writes.newProcess(portal, v.name, who, v.picked),
      follow: 'Open the process',
      onDone: () => form.reset({ name: '', who: v.who, picked: [] }),
    });
  });
  if (loose.length === 0)
    return (
      <Text muted block>
        Every recorded screen is in a process.
      </Text>
    );
  return (
    <form onSubmit={(e) => void submit(e)} aria-label="New process from screens">
      <Stack>
        <Cluster>
          <Field label="New process name">
            <Input required maxLength={200} autoComplete="off" {...form.register('name')} />
          </Field>
          <Field label="Persona">
            <Input required maxLength={200} autoComplete="off" {...form.register('who')} />
          </Field>
        </Cluster>
        <Columns
          main={
            <Fieldset legend="Tick the screens in the order a person walks them">
              <Stack>
                <Text small muted>
                  Open a picture to see the screen large; it does not tick it.
                </Text>
                {loose.map((s) => (
                  <Cluster key={s.state}>
                    <Picture size="sm" shot={s.shot} wire={s.wire} title={s.title || s.route} route={s.route} scans={s.scans} />
                    <Check
                      label={
                        <Stack>
                          <Text route>{s.route}</Text>
                          <Text small muted asIs>
                            {s.title}
                          </Text>
                        </Stack>
                      }
                      checked={picked.includes(s.state)}
                      onChange={(e) => setPicked(e.target.checked ? [...picked, s.state] : picked.filter((p) => p !== s.state))}
                    />
                  </Cluster>
                ))}
              </Stack>
            </Fieldset>
          }
          side={
            <Stack>
              <Picked picked={picked} byId={byId} set={setPicked} />
              <Cluster>
                <Button type="submit" disabled={!name.trim() || picked.length === 0}>
                  New process from these
                </Button>
              </Cluster>
            </Stack>
          }
        />
      </Stack>
    </form>
  );
}
