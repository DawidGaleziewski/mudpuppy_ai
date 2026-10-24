import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Button,
  Cluster,
  Columns,
  Field,
  Graph,
  GraphNode,
  Legend,
  Path,
  Plate,
  Select,
  Split,
  Stack,
  SubHead,
  Table,
  Tag,
  Text,
} from '../design-system';
import { planHref, recoverHref } from '../app/api-plan';
import { scanKey, useScanGraph, useScanHead, type ScanFailure, type ScanGraph as Data, type ScanNode } from '../app/api-scan';
import { writes } from '../app/api-write';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { GraphSkeleton, QueryState } from '../app/QueryState';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';
import { stateHref } from './RecordedInspector';

const plural = (n: number, w: string) => `${String(n)} ${w}${n === 1 ? '' : 's'}`;

function Summary({ g, here, pick, ask }: { g: Data; here: ScanNode | undefined; pick: (id: string) => void; ask: (a: Ask) => void }) {
  const r = g.recovery;
  const stop = g.nodes.find((n) => n.id === g.stop_node);
  const lastFail = stop?.failures.at(-1);
  const counts = [
    `${String(r.steps)} steps`,
    plural(g.nodes.length, 'screen'),
    plural(g.failures, 'failed action'),
    ...(g.unreachable ? [`${plural(g.unreachable, 'control')} not found again`] : []),
    `${String(r.queued)} queued`,
  ].join(' · ');
  let how = 'Completed without a failed action.';
  if (r.stopped) how = `Stopped on ${stop ? `${stop.title} ${stop.route}` : 'an unknown screen'}: ${r.warning ?? 'stopped by the BA or the session'}.`;
  else if (g.failures || g.unreachable) how = 'Completed; pick a red screen to see what failed there.';
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  return (
    <Plate
      title={r.stopped ? 'Where it stopped' : 'How it went'}
      {...(r.stopped ? { variant: 'failure' as const } : {})}
      actions={<ShownStatus status={r.status} />}
    >
      <Stack>
        <Text block>{`${counts}. ${how}`}</Text>
        {g.path.length > 1 && (
          <Path
            label="Path to where it stopped"
            steps={[
              ...g.path.map((id, i) => ({
                id,
                label: byId.get(id)?.route ?? id,
                here: i === g.path.length - 1 || here?.id === id,
                onSelect: () => pick(id),
              })),
              ...(lastFail ? [{ id: 'failed', label: `✕ ${lastFail.label}`, failed: true }] : []),
            ]}
          />
        )}
        {r.stopped && (
          <>
            <Cluster>
              <Button
                variant="primary"
                onClick={() =>
                  ask({
                    title: 'Resume this scan?',
                    text: `A new scan of ${r.persona} in ${r.environment} starts, linked to this one: it replays to the screens with queued items and carries on, without redoing what this scan did. The request goes to the portal's conversation.`,
                    confirm: 'Resume',
                    write: writes.resume(g.scan),
                  })
                }
              >
                Resume
              </Button>
              <Text small href={recoverHref(g.scan)}>
                Recovery page with attempts
              </Text>
            </Cluster>
          </>
        )}
      </Stack>
    </Plate>
  );
}

function Failure({ g, f, node, ask }: { g: Data; f: ScanFailure; node: ScanNode; ask: (a: Ask) => void }) {
  const [variation, setVariation] = useState(g.variations[0]?.value ?? 'none');
  const varLabel = g.variations.find((o) => o.value === variation)?.label ?? variation;
  return (
    <Stack>
      <Text>
        <Text strong>{f.label}</Text>{' '}
        <Text small muted>
          {f.error}
        </Text>
      </Text>
      <Cluster>
        <Field label={`Variation for ${f.label}`}>
          <Select value={variation} onChange={(e) => setVariation(e.target.value)}>
            {g.variations.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          size="sm"
          variant="strong"
          onClick={() =>
            ask({
              title: 'Retry this path?',
              text: `A retry scan replays to ${node.title} and presses “${f.label}” again (${varLabel}). The request goes to the portal's conversation.`,
              confirm: 'Retry this path',
              write: writes.retry(g.scan, f.transition, variation),
            })
          }
        >
          Retry this path
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() =>
            ask({
              title: 'Skip it in the next scans?',
              text: `A Skip mark on “${f.label}” on ${node.title}: the next scans leave this action out.`,
              confirm: 'Skip it',
              write: writes.skip(g.scan, f.transition),
            })
          }
        >
          Skip it in the next scans
        </Button>
      </Cluster>
    </Stack>
  );
}

function Inspector({ g, here, ask }: { g: Data; here: ScanNode | undefined; ask: (a: Ask) => void }) {
  // the scan's head is already fetched by the page: its portal names the plan
  const portal = useScanHead(g.scan).data?.portal ?? '';
  if (!here)
    return (
      <Plate title="Screen">
        <Text small muted block>
          Pick a screen to see what failed on it and to restart from it.
        </Text>
      </Plate>
    );
  return (
    <Plate title={<Text asIs>{here.title}</Text>} actions={<ShownStatus status={here.status} />}>
      <Stack>
        <Text block>
          <Text route>{here.route}</Text>
          {` · screen ${String(here.order)} of ${String(g.nodes.length)}${here.stopped_here ? ' · the scan stopped here' : ''}`}
        </Text>
        <Text small href={stateHref(here.state_id)}>
          Open the screen this scan recorded
        </Text>
        <SubHead>{`Failed here · ${String(here.failures.length)}`}</SubHead>
        {here.failures.length === 0 ? (
          <Text small muted>
            No action of this scan failed on this screen.
          </Text>
        ) : (
          here.failures.map((f) => <Failure key={f.transition} g={g} f={f} node={here} ask={ask} />)
        )}
        {here.unreachable > 0 && (
          <Text small block>{`${plural(here.unreachable, 'control')} the crawler could not find again; Resume or a scan from here tries ${here.unreachable === 1 ? 'it' : 'them'} anew.`}</Text>
        )}
        {here.queued > 0 && <Text small block>{`${plural(here.queued, 'item')} still queued here.`}</Text>}
        <SubHead>Scan from here</SubHead>
        <Cluster>
          <Button
            size="sm"
            onClick={() =>
              ask({
                title: 'Mark Start here?',
                text: `The next focused scan replays to ${here.title} and explores from it. The mark waits in the Next scan plan until a scan uses it.`,
                confirm: 'Mark Start here',
                write: writes.mark(here.state_id, 'start', false),
              })
            }
          >
            Mark Start here
          </Button>
          <Text small href={planHref(portal)}>
            Plan the next scan
          </Text>
        </Cluster>
      </Stack>
    </Plate>
  );
}

function Order({ g, here, pick }: { g: Data; here: ScanNode | undefined; pick: (id: string) => void }) {
  const columns = [
    { header: '#', numeric: true, cell: (n: ScanNode) => n.order },
    {
      header: 'Screen',
      rowHeader: true,
      cell: (n: ScanNode) => (
        <Cluster>
          <Button size="sm" variant="quiet" aria-pressed={here?.id === n.id} onClick={() => pick(n.id)}>
            {n.title || '(untitled page)'}
          </Button>
          <Text route>{n.route}</Text>
          {n.stopped_here && (
            <Tag size="sm" intent>
              Stopped here
            </Tag>
          )}
        </Cluster>
      ),
    },
    { header: 'State', cell: (n: ScanNode) => <ShownStatus status={n.status} /> },
    { header: 'Failed', numeric: true, cell: (n: ScanNode) => n.failures.length + n.unreachable },
    { header: 'Queued', numeric: true, cell: (n: ScanNode) => n.queued },
  ];
  return (
    <Plate title={`Screens in the order seen · ${String(g.nodes.length)}`} flush>
      <Table caption="Screens this scan saw, in the order it first saw them" columns={columns} rows={g.nodes} rowKey={(n) => n.id} dense flush />
    </Plate>
  );
}

function Body({ g }: { g: Data }) {
  const [params, setParams] = useSearchParams();
  const { ask, view } = useConfirmedWrite(scanKey(g.scan));
  const selected = params.get('node') ?? '';
  const here = g.nodes.find((n) => n.id === (selected || g.open_node));
  const pick = (id: string) => setParams({ node: id }, { replace: true });
  if (g.nodes.length === 0)
    return (
      <Plate title="No screens recorded in this scan">
        <Text block>A scan&apos;s graph shows the screens it saw and the moves it made.</Text>
      </Plate>
    );
  return (
    <Stack>
      {view}
      <Summary g={g} here={here} pick={pick} ask={ask} />
      <Columns
        main={
          <Stack>
            <Graph label="Graph of this scan, from its first screen" width={g.width} height={g.height} edges={g.edges} embedded>
              {g.nodes.map((n) => (
                <GraphNode
                  key={n.id}
                  id={n.id}
                  x={n.x}
                  y={n.y}
                  height={g.node_h}
                  near={n.near}
                  route={n.route}
                  title={<Text asIs>{n.title}</Text>}
                  fullTitle={n.title}
                  state={n.state ?? undefined}
                  pressed={here?.id === n.id}
                  onSelect={() => pick(n.id)}
                  marks={
                    n.stopped_here ? (
                      <Tag size="sm" intent>
                        Stopped here
                      </Tag>
                    ) : undefined
                  }
                  meta={
                    <>
                      <ShownStatus status={n.status} />
                      {n.chips.map((c) => (
                        <ShownChip key={c.word} chip={c} />
                      ))}
                    </>
                  }
                />
              ))}
            </Graph>
            <Split>
              <Cluster>
                {g.legend.map((s) => (
                  <ShownStatus key={s.word} status={s} />
                ))}
                <Legend label="Moves" items={g.edge_legend.map((o) => ({ state: o.value, label: o.label }))} />
              </Cluster>
              <Text small muted>
                Pick a screen to see what failed there and restart it · arrows move along the tree
              </Text>
            </Split>
            <Order g={g} here={here} pick={pick} />
          </Stack>
        }
        side={<Inspector g={g} here={here} ask={ask} />}
      />
    </Stack>
  );
}

/** A scan's Graph tab (spec 035): where it went and what failed, with the restarts next to the screen they belong to. */
export function ScanGraph({ scan }: { scan: string }) {
  const q = useScanGraph(scan);
  return (
    <QueryState query={q} what="the scan's graph" skeleton={<GraphSkeleton />}>
      {(g) => <Body g={g} />}
    </QueryState>
  );
}
