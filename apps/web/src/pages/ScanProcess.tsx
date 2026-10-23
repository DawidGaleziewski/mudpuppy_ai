import { Diagram, Facts, Plate, Stack, Table, Text } from '../design-system';
import { useProcess, type ProcessTab } from '../app/api-scan-trace';
import { EvidenceRef } from '../app/EvidenceRef';
import { QueryState } from '../app/QueryState';
import { ShownStatus } from '../app/ShownStatus';

type Step = ProcessTab['steps'][number];

const stepColumns = [
  { header: '#', numeric: true, cell: (s: Step) => s.ord },
  {
    header: 'Intent',
    rowHeader: true,
    cell: (s: Step) => (
      <Stack>
        <Text asIs>{s.intent}</Text>
        {s.action && <Text small mono>{`action ${s.action}`}</Text>}
      </Stack>
    ),
  },
  { header: 'Kind', cell: (s: Step) => <Text mono small>{s.kind}</Text> },
  { header: 'Value', cell: (s: Step) => (s.value ? <Text mono small>{s.value}</Text> : <Text muted>—</Text>) },
  {
    header: 'Outcomes',
    cell: (s: Step) =>
      s.outcomes.length ? (
        <Stack>
          {s.outcomes.map((o, i) => (
            <Text key={i} small asIs>
              {o}
            </Text>
          ))}
        </Stack>
      ) : (
        <Text muted>None observed</Text>
      ),
  },
  { header: 'Confidence', cell: (s: Step) => <ShownStatus status={s.confidence} /> },
  { header: 'Evidence', cell: (s: Step) => <EvidenceRef e={s.evidence} /> },
];

function Body({ d }: { d: ProcessTab }) {
  const p = d.process;
  if (!p)
    return (
      <Plate title="No process recorded for this scan">
        <Text block>A trace scan records one process: its goal, ordered steps, and where it stopped. Map scans have none.</Text>
      </Plate>
    );
  return (
    <Stack>
      <Plate title={<Text asIs>{`Process ${p.name}`}</Text>} actions={<ShownStatus status={p.outcome} />}>
        <Stack>
          <Facts
            items={[
              ['Goal', <Text asIs>{p.goal}</Text>],
              ['Persona', p.persona],
              ['Observed result', <Text asIs>{p.observed_result ?? '—'}</Text>],
              ['Boundary action', <Text mono small>{p.boundary_action ?? '—'}</Text>],
              ...(p.followup ? [['Follow-up', <Text mono small>{p.followup}</Text>] as const] : []),
              ['Started · ended (UTC)', <Text mono small>{`${p.started_at} · ${p.ended_at ?? '—'}`}</Text>],
            ]}
          />
          {p.not_observable && (
            <Text block>
              <Text strong>Not observed:</Text> <Text asIs>{p.not_observable}</Text>
            </Text>
          )}
        </Stack>
      </Plate>
      {d.diagram && (
        <Plate label="Process map">
          <Diagram embedded source={d.diagram} caption="Process map from the recorded steps" />
        </Plate>
      )}
      <Plate title={`Steps · ${String(d.steps.length)}`} flush>
        <Table
          caption="Recorded steps in order"
          columns={stepColumns}
          rows={d.steps}
          rowKey={(s) => s.id}
          flush
          empty="No step recorded yet. Steps appear as the crawler agent acts in the trace scan."
        />
      </Plate>
    </Stack>
  );
}

/** A trace scan's process: its goal and outcome, its map, its steps in order. */
export function ProcessSection({ scan }: { scan: string }) {
  const q = useProcess(scan);
  return (
    <QueryState query={q} what="the recorded process">
      {(d) => <Body d={d} />}
    </QueryState>
  );
}
