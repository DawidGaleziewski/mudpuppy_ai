import { useState } from 'react';
import { useParams } from 'react-router';
import { Button, Cluster, Columns, Facts, Field, PageHead, Plate, ScanId, Select, Stack, Table, Text } from '../design-system';
import { recoverKey, useRecovery, type RecoverPage } from '../app/api-plan';
import { stateHref } from '../app/api-state';
import { writes } from '../app/api-write';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

const scanHref = (scan: string) => `/app/scans/${encodeURIComponent(scan)}`;
const RESULT: Record<string, string> = { true: 'Passed', false: 'Failed', null: '—' };

function Where({ r, ask }: { r: RecoverPage; ask: (a: Ask) => void }) {
  return (
    <Plate title="Where it stopped">
      <Stack>
        <Facts
          items={[
            [
              'Last good screen',
              r.last_state ? (
                <Cluster key="l">
                  <Text asIs href={stateHref(r.last_state[0])}>{r.last_state[1]}</Text>
                  <Text route>{r.last_state[2]}</Text>
                </Cluster>
              ) : (
                <Text key="l" muted>none recorded</Text>
              ),
            ],
            ['Reason', r.reason],
            ['Failure class', r.failure_class],
          ]}
        />
        <Cluster>
          <Button
            variant="primary"
            onClick={() =>
              ask({
                title: 'Resume this scan?',
                text: 'A new scan, linked as continuing this one: it replays to the screens with queued items and carries on, without redoing what this scan did.',
                confirm: 'Resume',
                write: writes.resume(r.scan),
                follow: 'Open the assistant',
              })
            }
          >
            Resume
          </Button>
          <Text small muted>A new scan, linked as continuing this one: it replays to the screens with queued items and carries on, without redoing what this scan did.</Text>
        </Cluster>
      </Stack>
    </Plate>
  );
}

function FailedAction({ r, f, ask }: { r: RecoverPage; f: RecoverPage['failed'][number]; ask: (a: Ask) => void }) {
  const [variation, setVariation] = useState(r.variations[0]?.value ?? 'none');
  return (
    <Stack>
      <Text>
        <Text strong asIs>{f.label}</Text>
        {' on '}
        <Text route>{f.route}</Text> <Text small muted>{f.error}</Text>
      </Text>
      <Cluster>
        <Field label={`Variation for ${f.label}`}>
          <Select value={variation} onChange={(e) => setVariation(e.target.value)}>
            {r.variations.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </Select>
        </Field>
        <Button
          size="sm"
          onClick={() =>
            ask({ title: `Retry "${f.label}"?`, text: 'A new scan replays to this action and presses it once more, with the variation you chose.', confirm: 'Retry this path', write: writes.retry(r.scan, f.transition, variation), follow: 'Open the assistant' })
          }
        >
          Retry this path
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => ask({ title: `Skip "${f.label}" in the next scans?`, text: 'A Skip mark: the next scans leave this action out while the mark is open.', confirm: 'Skip it', write: writes.skip(r.scan, f.transition) })}
        >
          Skip it in the next scans
        </Button>
      </Cluster>
    </Stack>
  );
}

function Attempts({ r }: { r: RecoverPage }) {
  return (
    <Plate title={`Attempts and continuations · ${String(r.attempts.length)}`} flush>
      <Table
        caption="Scans started from this one"
        dense
        flush
        rows={r.attempts}
        rowKey={(a) => a.scan}
        empty={<Text muted>No attempt yet.</Text>}
        columns={[
          { header: 'Scan', rowHeader: true, cell: (a) => <ScanId id={a.scan} href={scanHref(a.scan)} tag /> },
          { header: 'Type', cell: (a) => a.type },
          { header: 'Variation', cell: (a) => a.variation },
          { header: 'Status', cell: (a) => <ShownStatus status={a.status} /> },
          { header: 'Result', cell: (a) => RESULT[String(a.passed)] },
          { header: 'Started (UTC)', cell: (a) => <Text mono small>{a.started_at}</Text> },
        ]}
      />
    </Plate>
  );
}

function Classes() {
  return (
    <Plate title="Failure classes">
      <Facts
        items={[
          ['Crawler error', 'A control not found or a driver crash: retry, waiting longer.'],
          ['Portal error', 'HTTP 5xx or an error page: it is recorded as a technical state; recheck later.'],
          ['Blocked', 'A safety class, a credential or a captcha: ask the person.'],
        ]}
      />
    </Plate>
  );
}

/** A stopped scan's recovery (screen 15, spec 034 R-66): where and why it stopped, Resume, Retry this path, Skip it. */
export function ScanRecover() {
  const { scan = '' } = useParams();
  const q = useRecovery(scan);
  const { ask, view } = useConfirmedWrite(recoverKey(scan));
  return (
    <Shell current="scans" portal={q.data?.portal}>
      <QueryState query={q} what="the stopped scan">
        {(r) => (
          <Stack>
            <PageHead
              crumbs={[{ label: 'Scans', href: `/app/portals/${encodeURIComponent(r.portal)}/scans` }, { label: <ScanId id={r.scan} />, href: scanHref(r.scan) }, { label: 'Recover' }]}
              title={<>Pick up scan <ScanId id={r.scan} /></>}
              meta={
                <Cluster>
                  <Text small>{`${r.portal} · ${r.persona} · ${r.environment}`}</Text>
                  <ShownStatus status={r.status} />
                  <Text small>{`after ${String(r.steps)} steps · ${String(r.pending)} item${r.pending === 1 ? '' : 's'} left queued`}</Text>
                </Cluster>
              }
            />
            {view}
            <Columns
              main={
                <Stack>
                  <Where r={r} ask={ask} />
                  <Plate title={`Actions that failed · ${String(r.failed.length)}`}>
                    <Stack>
                      {r.failed.length ? r.failed.map((f) => <FailedAction key={f.transition} r={r} f={f} ask={ask} />) : <Text muted>No action of this scan failed; it stopped for the reason above.</Text>}
                    </Stack>
                  </Plate>
                  <Attempts r={r} />
                </Stack>
              }
              side={<Classes />}
            />
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
