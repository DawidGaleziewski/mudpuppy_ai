import { Button, Chip, Cluster, Plate, Row, Rows, Stack, SubHead, Table, Tag, Text } from '../design-system';
import { stateHref, type EntryUrl, type FormStep, type Param } from '../app/api-state';
import { writes } from '../app/api-write';
import type { Ask } from '../app/ConfirmedWrite';
import { ShownStatus } from '../app/ShownStatus';

function Probes({ step }: { step: FormStep }) {
  return (
    <Table
      caption="What each form probe did from this step"
      flush
      dense
      rows={step.outcomes}
      rowKey={(o) => `${o.probe}-${o.target ?? ''}-${o.status.word}`}
      columns={[
        { header: 'Probe', cell: (o) => <Stack><Text mono small>{o.probe}</Text>{o.fault && <Text small muted>{o.fault}</Text>}</Stack> },
        { header: 'On', cell: (o) => <Text small asIs>{o.target ?? 'the whole form'}</Text> },
        {
          header: 'Outcome',
          cell: (o) => (
            <Stack>
              <ShownStatus status={o.status} />
              {o.accepted && <Text small>accepted wrong input</Text>}
              {o.possible_new_process && <Text small>possible new process</Text>}
              {o.to_state && <Text small href={stateHref(o.to_state)}>Landing state</Text>}
            </Stack>
          ),
        },
        {
          header: 'Messages',
          cell: (o) =>
            o.messages.length ? (
              <Stack>
                {o.messages.map((m, i) => (
                  <Text key={i} small>{`${m.field ? `${m.field}: ` : ''}${m.text}${m.native ? ' (browser)' : ''}`}</Text>
                ))}
              </Stack>
            ) : (
              <Text small muted>{o.reason ?? ''}</Text>
            ),
        },
      ]}
    />
  );
}

/** The form step this screen shows (spec 032, design screen 13): its states, the probes and the Probe mark. */
export function FormStepPlate({ step, current, canMark, ask }: { step: FormStep; current: string; canMark: boolean; ask: (a: Ask) => void }) {
  const marked = step.mark !== null;
  return (
    <Plate
      title="States of this step"
      actions={<Text small asIs>{`Step ${String(step.step)} · ${step.label} · ${step.route}`}</Text>}
      flush
    >
      <Stack>
        <Cluster>
          {marked && <Tag size="sm" intent>Probe</Tag>}
          {step.outcomes.length ? (
            step.groups.map(([group, n]) => (n ? <Chip key={group}>{`${String(n)} ${group}`}</Chip> : <Chip key={group} variant="dashed">{`${group} not probed`}</Chip>))
          ) : (
            <Chip variant="dashed">Not probed</Chip>
          )}
        </Cluster>
        <Text small>
          {step.mark
            ? `Marked for probing by ${step.mark[0]}, ${step.mark[1]}. The next form-probing scan tries this step with wrong and empty values, other options and failing requests; ask the assistant to probe the marked forms.`
            : 'Scans press this step once with test values. Mark it to have a form-probing scan try it beyond that.'}
        </Text>
        {canMark ? (
          <Cluster>
            <Button
              size="sm"
              variant={marked ? 'quiet' : 'default'}
              onClick={() =>
                ask({
                  title: marked ? 'Remove the Probe mark?' : 'Mark this step for probing?',
                  text: marked ? 'The next form-probing scan leaves this step as it is.' : 'The next form-probing scan tries this step beyond the test values.',
                  confirm: marked ? 'Remove the mark' : 'Mark for probing',
                  write: writes.probe(current, marked),
                })
              }
            >
              {marked ? 'Remove the mark' : 'Mark for probing'}
            </Button>
          </Cluster>
        ) : (
          <Text small muted>Set MUDPUPPY_REVIEWER to your name to mark form steps.</Text>
        )}
        <Rows label="States of this step">
          {step.states.map((s) => (
            <Row key={s.state} current={s.state === current} aside={<ShownStatus status={s.kind} />}>
              <Text asIs {...(s.state === current ? {} : { href: stateHref(s.state) })}>{s.title || '(untitled page)'}</Text>
            </Row>
          ))}
        </Rows>
        {step.outcomes.length > 0 && (
          <>
            <SubHead>{`Form probes · ${String(step.outcomes.length)}`}</SubHead>
            <Probes step={step} />
          </>
        )}
      </Stack>
    </Plate>
  );
}

/** Every URL the screen was reached under, with the redirects, and every parameter (spec 019). */
export function ReachedUnder({ urls, more, params }: { urls: EntryUrl[]; more: number; params: Param[] }) {
  return (
    <Plate title={`Reached under · ${String(urls.length)}`} flush>
      <Stack>
        <Text small muted>Every URL this screen was observed under, with the redirects that led there, and every parameter those URLs carried (spec 019). Nothing is normalised away.</Text>
        <Table
          caption="URLs this screen was reached under"
          flush
          rows={urls}
          rowKey={(e) => e.url}
          empty={<Text small muted>No URLs recorded for this screen. Scans before spec 019 kept only the route template.</Text>}
          columns={[
            { header: 'URL', cell: (e) => <Text route>{e.url}</Text> },
            { header: 'Visits', numeric: true, cell: (e) => e.visits },
            {
              header: 'Reached by',
              cell: (e) => (
                <Stack>
                  <Text small>{e.via.join(', ')}</Text>
                  {e.hops.map((h, i) => (
                    <Text key={i} small muted>{`${h.kind}${h.status ? ` ${String(h.status)}` : ''} → ${h.url}${h.reason ? ` (${h.reason})` : ''}`}</Text>
                  ))}
                </Stack>
              ),
            },
          ]}
        />
        {more > 0 && <Text small muted>{`And ${String(more)} more URLs`}</Text>}
        {params.length > 0 && (
          <>
            <SubHead>Parameters</SubHead>
            <Table
              caption="URL parameters"
              flush
              dense
              rows={params}
              rowKey={(p) => `${p.where}:${p.name}`}
              columns={[
                { header: 'Name', cell: (p) => <Text mono small>{p.name}</Text> },
                { header: 'In', cell: (p) => p.where },
                { header: 'Values', cell: (p) => <Text route>{p.values.map((v) => v ?? '(no value)').join(', ')}</Text> },
                { header: 'Distinct', numeric: true, cell: (p) => p.distinct },
                { header: 'Visits', numeric: true, cell: (p) => p.visits },
              ]}
            />
          </>
        )}
      </Stack>
    </Plate>
  );
}
