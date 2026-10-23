import { Button, Cluster, Facts, Plate, Row, Rows, ScanId, Stack, SubHead, Tag, Tags, Text } from '../design-system';
import { planHref } from '../app/api-plan';
import { recordedMapKey, useRecordedNode, type RecordedNodeDetail } from '../app/api-recorded';
import { writes } from '../app/api-write';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';

/** How many moves out the inspector lists; the screen page has them all. */
const MOVES_SHOWN = 20;

import { stateHref } from '../app/api-state';

export { stateHref };
export const scanHref = (scan: string) => `/app/scans/${encodeURIComponent(scan)}`;

function About({ d }: { d: RecordedNodeDetail }) {
  const ids = d.scans.map((s) => s.id);
  return (
    <Stack>
      <Facts items={[['Route', <Text route>{d.route}</Text>]]} />
      <SubHead>{`Seen in · ${String(d.scans.length)}`}</SubHead>
      {d.scans.length ? (
        <Stack>
          <Tags>
            {d.scans.map((s) => (
              <ScanId key={s.id} id={s.id} siblings={ids} href={scanHref(s.id)} />
            ))}
          </Tags>
          <Text small muted>
            {d.personas.join(', ')}
          </Text>
        </Stack>
      ) : (
        <Text small muted>
          No scan saw it.
        </Text>
      )}
    </Stack>
  );
}

function States({ d }: { d: RecordedNodeDetail }) {
  if (d.states.length < 2 && !d.probe) return null;
  return (
    <Stack>
      <SubHead>{`States · ${String(d.states.length)}`}</SubHead>
      <Rows label="States">
        {d.states.map((s) => (
          <Row key={s.id} aside={<ShownStatus status={s.kind} />}>
            <Text href={stateHref(s.id)}>{s.label}</Text>
          </Row>
        ))}
      </Rows>
      {d.outcomes.length > 0 && (
        <Cluster>
          {d.outcomes.map((c) => (
            <ShownChip key={c.word} chip={c} />
          ))}
        </Cluster>
      )}
    </Stack>
  );
}

function Moves({ d }: { d: RecordedNodeDetail }) {
  return (
    <Stack>
      <SubHead>{`Moves out · ${String(d.moves.length)}`}</SubHead>
      {d.moves.length === 0 ? (
        <Text small muted>
          No recorded move leaves this screen.
        </Text>
      ) : (
        <Rows label="Moves out">
          {d.moves.slice(0, MOVES_SHOWN).map((m) => (
            <Row
              key={`${m.label}-${m.to_route}`}
              aside={m.failed ? <Text small>failed</Text> : <Text small muted mono>{`${String(m.times)}×`}</Text>}
            >
              <Text asIs>{m.label || '(no name)'}</Text> <Text route>{`→ ${m.to_route}`}</Text>
            </Row>
          ))}
        </Rows>
      )}
      {d.moves.length > MOVES_SHOWN && (
        <Text small muted>{`and ${String(d.moves.length - MOVES_SHOWN)} more on the screen page`}</Text>
      )}
    </Stack>
  );
}

function Left({ d }: { d: RecordedNodeDetail }) {
  if (d.items.length === 0) return null;
  return (
    <Stack>
      <SubHead>{`Left on this page · ${String(d.items.length)}`}</SubHead>
      <Rows label="Left on this page">
        {d.items.map((it) => (
          <Row key={`${it.label}-${it.status.word}`} aside={<ShownStatus status={it.status} />}>
            <Text asIs>{it.label || '(no name)'}</Text>
            {it.reason && (
              <>
                {' '}
                <Text small muted>
                  {it.reason}
                </Text>
              </>
            )}
          </Row>
        ))}
      </Rows>
    </Stack>
  );
}

function Marks({ portal, d, ask }: { portal: string; d: RecordedNodeDetail; ask: (a: Ask) => void }) {
  if (d.marks.length === 0 && !d.probe) return null;
  const probe = d.probe;
  return (
    <Stack>
      {d.marks.length > 0 && (
        <>
          <SubHead>Next scan</SubHead>
          <Cluster>
            {d.marks.map((m) => (
              <Button
                key={m.kind}
                size="sm"
                variant="quiet"
                title={m.hint}
                aria-pressed={m.on}
                onClick={() =>
                  ask({
                    title: m.on ? `Remove the ${m.label} mark?` : `Mark ${m.label}?`,
                    text: m.on
                      ? `The next scans no longer use the ${m.label} mark on ${d.title}.`
                      : `${m.hint} The mark waits in the Next scan plan until a scan uses it.`,
                    confirm: m.on ? 'Remove the mark' : `Mark ${m.label}`,
                    write: writes.mark(m.state, m.kind, m.on),
                  })
                }
              >
                {m.on ? `✓ ${m.label}` : m.label}
              </Button>
            ))}
          </Cluster>
          <Text small href={planHref(portal)}>
            Plan the next scan
          </Text>
        </>
      )}
      {probe && (
        <>
          <SubHead>Probing</SubHead>
          {probe.on && (
            <Text small>
              <Tag size="sm" intent>
                Probe
              </Tag>{' '}
              marked: the next &quot;probe the marked forms&quot; scan tries it.
            </Text>
          )}
          <Cluster>
            <Button
              size="sm"
              variant={probe.on ? 'default' : 'strong'}
              onClick={() =>
                ask({
                  title: probe.on ? 'Remove the Probe mark?' : 'Mark this form step for probing?',
                  text: probe.on
                    ? 'The next probe scan leaves this form step out.'
                    : 'The next "probe the marked forms" scan tries other values in this form step.',
                  confirm: probe.on ? 'Remove the mark' : 'Mark for probing',
                  write: writes.probe(probe.state, probe.on),
                })
              }
            >
              {probe.on ? 'Remove the mark' : 'Mark for probing'}
            </Button>
          </Cluster>
        </>
      )}
    </Stack>
  );
}

function Selected({ portal, screen }: { portal: string; screen: string }) {
  const q = useRecordedNode(portal, screen);
  const { ask, view } = useConfirmedWrite(recordedMapKey(portal));
  const first = q.data?.first_state;
  return (
    <Plate
      title={<Text asIs>{q.data ? q.data.title || '(untitled page)' : screen}</Text>}
      actions={first ? <Text small href={stateHref(first)}>Open screen</Text> : undefined}
    >
      <QueryState query={q} what="the screen">
        {(d) => (
          <Stack>
            <About d={d} />
            <States d={d} />
            <Moves d={d} />
            <Left d={d} />
            <Marks portal={portal} d={d} ask={ask} />
            {view}
          </Stack>
        )}
      </QueryState>
    </Plate>
  );
}

/** The recorded map's side column (screen 12): the screen's facts, states, moves, what it left and the marks for the next scan. */
export function RecordedInspector({ portal, screen }: { portal: string; screen: string }) {
  if (screen) return <Selected portal={portal} screen={screen} />;
  return (
    <Plate title="Inspector">
      <Text small muted block>
        Select a screen to see its states, the scans that saw it and where its actions lead.
      </Text>
    </Plate>
  );
}
