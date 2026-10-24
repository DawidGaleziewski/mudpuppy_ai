import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Cluster, Field, Input, Row, Rows, Stack, SubHead, Text } from '../design-system';
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
});
type NewProcessValues = z.infer<typeof NewProcessSchema>;

export interface NewProcessProps {
  portal: string;
  loose: readonly LooseScreen[];
  persona: string;
  /** The ticked screens in tick order (the grid's and the dialog's ticks, designer T-05). */
  picked: readonly string[];
  setPicked: (p: string[]) => void;
  ask: (a: Ask) => void;
}

/**
 * New process from these (designer T-05, BR-011): name it, give its persona; the ticked screens
 * are its steps in the order ticked (↑ / ↓ to reorder), its first the start and its last the end;
 * Create process. The ticks belong to the sorting view; this panel only orders and names them.
 */
export function NewProcess({ portal, loose, persona, picked, setPicked, ask }: NewProcessProps) {
  const form = useForm<NewProcessValues>({ defaultValues: { name: '', who: persona }, resolver: zodResolver(NewProcessSchema) });
  const name = useWatch({ control: form.control, name: 'name' });
  const byId = new Map(loose.map((s) => [s.state, s]));
  const submit = form.handleSubmit((v) => {
    const who = v.who.trim() || persona;
    ask({
      title: `Make ${v.name}?`,
      text: `A new process as ${who}, with ${String(picked.length)} screen${picked.length === 1 ? '' : 's'} as its as-is model A, in the order shown.`,
      confirm: 'Create process',
      write: writes.newProcess(portal, v.name, who, [...picked]),
      follow: 'Open the process',
      onDone: () => {
        form.reset({ name: '', who: v.who });
        setPicked([]);
      },
    });
  });
  return (
    <form onSubmit={(e) => void submit(e)} aria-label="New process from these">
      <Stack>
        <Field label="New process name">
          <Input required maxLength={200} autoComplete="off" {...form.register('name')} />
        </Field>
        <Field label="Persona">
          <Input required maxLength={200} autoComplete="off" {...form.register('who')} />
        </Field>
        <Picked picked={picked} byId={byId} set={setPicked} />
        <Cluster>
          <Button type="submit" disabled={!name.trim() || picked.length === 0}>
            Create process
          </Button>
        </Cluster>
      </Stack>
    </form>
  );
}
