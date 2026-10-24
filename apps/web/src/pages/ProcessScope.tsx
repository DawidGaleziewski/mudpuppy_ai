import { Button, Callout, Plate, Row, Rows, Stack, Tag, Text } from '../design-system';
import type { ProcessPage } from '../app/api-process';
import { processHref } from '../app/api-processes';
import { writes } from '../app/api-write';
import type { Ask } from '../app/ConfirmedWrite';
import { splitBackAsk } from '../app/MergeDone';

/** Merged into another process (designer T-06): read-only here; Split back puts it back. */
function MergedInto({ d, ask }: { d: ProcessPage; ask: (a: Ask) => void }) {
  const m = d.scope?.merged_into;
  if (!m) return null;
  return (
    <Callout title={`Merged into ${m.kept_key}`}>
      <Stack>
        <Text block>
          {'Now part of '}
          <Tag size="sm" href={processHref(d.portal, m.kept_key)}>
            {m.kept_key}
          </Tag>
          {` ${m.kept_name}, by ${m.by} on ${m.at}${m.reason ? ` (“${m.reason}”)` : ''}. Its history stays readable here.`}
        </Text>
        <Button size="md" variant="strong" onClick={() => ask(splitBackAsk(d.portal, m.id, `${d.key} ${d.name}`))}>
          Split back
        </Button>
      </Stack>
    </Callout>
  );
}

/** Merges this process kept (History's events): each open one can be split back. */
function MergedHere({ d, ask }: { d: ProcessPage; ask: (a: Ask) => void }) {
  const here = (d.scope?.merges ?? []).filter((m) => m.kept_key === d.key);
  if (here.length === 0) return null;
  return (
    <Rows label="Merges into this process">
      {here.map((m) => (
        <Row
          key={m.id}
          aside={
            m.undone_at ? (
              <Text small muted>{`split back ${m.undone_at}`}</Text>
            ) : (
              <Button size="sm" variant="quiet" onClick={() => ask(splitBackAsk(d.portal, m.id, `${m.absorbed_key} ${m.absorbed_name}`))}>
                Split back
              </Button>
            )
          }>
          <Text small>{`Merged ${m.absorbed_key} ${m.absorbed_name} · ${m.by} · ${m.at}${m.reason ? ` · ${m.reason}` : ''}`}</Text>
        </Row>
      ))}
    </Rows>
  );
}

/** "Not on the observed path yet" (designer T-05): in the scope, in no step; Explore from here finds the path. */
function OffPath({ d, ask }: { d: ProcessPage; ask: (a: Ask) => void }) {
  const off = d.scope?.off_path ?? [];
  if (off.length === 0) return null;
  return (
    <Plate title={`Not on the observed path yet · ${String(off.length)}`}>
      <Stack>
        <Text small muted block>
          In this process&apos;s scope, but no scan has walked between its steps and these screens yet, so the as-is shows them in no step. Nothing is invented.
        </Text>
        <Rows label="Screens not on the observed path yet">
          {off.map((s) => (
            <Row
              key={s.state}
              aside={
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() =>
                    ask({
                      title: `Take ${s.title || s.route} out of ${d.name}?`,
                      text: 'It leaves the scope and counts as in no process again.',
                      confirm: 'Take out',
                      write: writes.removeFromScope(d.portal, d.id, [s.state]),
                    })
                  }>
                  Take out
                </Button>
              }>
              <Text asIs>{s.title || '(untitled page)'}</Text> <Text route>{s.route}</Text>
            </Row>
          ))}
        </Rows>
        <Button
          size="md"
          onClick={() =>
            ask({
              title: `Explore ${d.key} from here?`,
              text: 'A focused scan walks this process on the headless driver to find the paths to these screens; the as-is takes what it observes.',
              confirm: 'Explore',
              write: writes.explore(d.portal, d.key),
            })
          }>
          Explore from here
        </Button>
      </Stack>
    </Plate>
  );
}

/** A process's scope beyond A's steps and its merges (spec 078; designer T-05, T-06). */
export function ProcessScope({ d, ask }: { d: ProcessPage; ask: (a: Ask) => void }) {
  const moved = d.scope?.from_other ?? [];
  return (
    <>
      <MergedInto d={d} ask={ask} />
      {moved.length > 0 && (
        <Callout title="Branched from another as-is">
          {`${moved.join(', ')} came over with a merge and was drawn from the other process's as-is: re-base it on this A before Compare uses it.`}
        </Callout>
      )}
      <OffPath d={d} ask={ask} />
      <MergedHere d={d} ask={ask} />
    </>
  );
}
