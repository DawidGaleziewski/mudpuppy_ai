import { useState } from 'react';
import { Button, Cluster, Disclosure, Field, Grid, Plate, Select, Stack, Text } from '../design-system';
import type { StatusOut } from '../app/api';
import type { Suggestion } from '../app/api-processes';
import { writes } from '../app/api-write';
import type { Ask } from '../app/ConfirmedWrite';
import { useGo } from '../app/RouterAnchor';
import { ShownStatus } from '../app/ShownStatus';

/** Split before a step, or merge with another suggestion (spec 039 T079, v2-09). */
function SplitOrMerge({ portal, s, others, ask }: { portal: string; s: Suggestion; others: readonly Suggestion[]; ask: (a: Ask) => void }) {
  const [at, setAt] = useState('2');
  const [other, setOther] = useState(others[0]?.id ?? '');
  const otherName = others.find((o) => o.id === other)?.name ?? '';
  return (
    <Disclosure summary={<Text small>Split or merge</Text>}>
      <Stack>
        {s.routes.length > 1 && (
          <Cluster>
            <Field label="Split before">
              <Select value={at} onChange={(e) => setAt(e.target.value)}>
                {s.routes.slice(1).map((r, i) => (
                  <option key={`${r}-${String(i)}`} value={String(i + 2)}>{`step ${String(i + 2)} · ${r}`}</option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              onClick={() =>
                ask({
                  title: `Split ${s.name} in two?`,
                  text: `The second half starts at step ${at}. ${s.name} is not suggested again as one.`,
                  confirm: 'Split',
                  write: writes.suggestion(portal, s.id, 'split', { at: Number(at) }),
                })
              }
            >
              Split
            </Button>
          </Cluster>
        )}
        {others.length > 0 && (
          <Cluster>
            <Field label="Merge with">
              <Select value={other} onChange={(e) => setOther(e.target.value)}>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              onClick={() =>
                ask({
                  title: `Merge ${s.name} with ${otherName}?`,
                  text: 'One suggestion replaces the two; nothing is saved as a process until you accept it.',
                  confirm: 'Merge',
                  write: writes.suggestion(portal, s.id, 'merge', { with: other }),
                })
              }
            >
              Merge
            </Button>
          </Cluster>
        )}
      </Stack>
    </Disclosure>
  );
}

function Card({ portal, s, others, ask }: { portal: string; s: Suggestion; others: readonly Suggestion[]; ask: (a: Ask) => void }) {
  const go = useGo();
  const accept = (open: boolean): Ask => ({
    title: `Accept ${s.name}?`,
    text: `It becomes a process with ${String(s.routes.length)} screens as its as-is model A, as ${s.persona}.`,
    confirm: open ? 'Accept and open' : 'Accept',
    write: writes.suggestion(portal, s.id, 'accept'),
    follow: 'Open the process',
    ...(open
      ? {
          onDone: (r) => {
            if (r.href) go(r.href);
          },
        }
      : {}),
  });
  return (
    <Plate
      title={<Text asIs>{s.name}</Text>}
      variant="drawn"
      foot={
        <Cluster>
          <Button size="sm" variant="strong" onClick={() => ask(accept(false))}>
            Accept
          </Button>
          <Button size="sm" onClick={() => ask(accept(true))}>
            Edit first
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={() =>
              ask({
                title: `Dismiss ${s.name}?`,
                text: 'It is not suggested again for the same screens.',
                confirm: 'Dismiss',
                write: writes.suggestion(portal, s.id, 'dismiss'),
              })
            }
          >
            Dismiss
          </Button>
        </Cluster>
      }
    >
      <Stack>
        <Text route>{`${s.routes.join(' → ')} · ${String(s.routes.length)} screens`}</Text>
        <Text small muted>{`Why: ${s.why}`}</Text>
        {(s.routes.length > 1 || others.length > 0) && <SplitOrMerge portal={portal} s={s} others={others} ask={ask} />}
      </Stack>
    </Plate>
  );
}

/** The assistant's groupings (drawn, not saved) with Accept, Edit first, Dismiss, Split and Merge. */
export function ProcessSuggestions({
  portal,
  suggestions,
  suggested,
  ask,
}: {
  portal: string;
  suggestions: readonly Suggestion[];
  suggested: StatusOut;
  ask: (a: Ask) => void;
}) {
  return (
    <Stack>
      <Cluster>
        <ShownStatus status={suggested} />
        <Text small muted>
          From links between screens. Nothing is saved until you accept.
        </Text>
      </Cluster>
      {suggestions.length === 0 ? (
        <Text muted block>
          No open suggestions. Ask the assistant to regroup; dismissed groupings are not suggested again.
        </Text>
      ) : (
        <Grid min="300px">
          {suggestions.map((s) => (
            <Card key={s.id} portal={portal} s={s} others={suggestions.filter((o) => o.id !== s.id)} ask={ask} />
          ))}
        </Grid>
      )}
    </Stack>
  );
}
