import { useState } from 'react';
import {
  Callout,
  Check,
  Cluster,
  Code,
  Disclosure,
  Facts,
  Fieldset,
  Plate,
  Row,
  Rows,
  Stack,
  SubHead,
  Table,
  Text,
} from '../design-system';
import {
  useSpanChildren,
  useTraceCalls,
  useTraceSummary,
  type Fact,
  type TraceCall,
  type TraceCalls,
  type TraceEvent,
  type TraceSummary,
} from '../app/api-scan-trace';
import { EvidenceRef } from '../app/EvidenceRef';
import { QueryState } from '../app/QueryState';
import { CursorPager, useSectionParams } from '../app/SectionPaging';
import { ShownStatus } from '../app/ShownStatus';

type Phase = TraceSummary['phases'][number];
type Slow = TraceSummary['slowest'][number];

const phaseColumns = [
  { header: 'Phase', rowHeader: true, cell: (p: Phase) => <Text mono small>{p.name}</Text> },
  { header: 'Count', numeric: true, cell: (p: Phase) => p.count },
  { header: 'Sum', numeric: true, cell: (p: Phase) => p.sum },
  { header: 'p50', numeric: true, cell: (p: Phase) => p.p50 },
  { header: 'p95', numeric: true, cell: (p: Phase) => p.p95 },
];

const slowColumns = [
  { header: 'Seq', numeric: true, cell: (s: Slow) => `#${String(s.seq)}` },
  { header: 'Tool', rowHeader: true, cell: (s: Slow) => <Text mono small>{s.name}</Text> },
  { header: 'Duration', numeric: true, cell: (s: Slow) => s.duration },
  { header: 'Status', cell: (s: Slow) => <ShownStatus status={s.status} /> },
];

function Summary({ s }: { s: TraceSummary }) {
  if (!s.has_trace) return <Callout>No trace recorded for this scan. It predates tracing, or never reached the server.</Callout>;
  return (
    <Stack>
      <Plate title="Trace summary">
        <Facts
          items={[
            ['Calls', String(s.calls)],
            ['By tool', s.by_tool.map((t) => `${t.name} ${String(t.count)}`).join(' · ')],
            [
              'By status',
              <Cluster>
                {s.by_status.map((b) => (
                  <Text key={b.status.word} small>
                    {String(b.count)} <ShownStatus status={b.status} />
                  </Text>
                ))}
              </Cluster>,
            ],
            ['Tokens', s.tokens],
            ['Trace level', s.levels],
            [
              'Trace health',
              <Cluster>
                <ShownStatus status={s.health} />
                <Text small>{s.health_parts.join(' · ')}</Text>
              </Cluster>,
            ],
          ]}
        />
      </Plate>
      {s.phases.length > 0 && (
        <Plate title="Time per phase" flush>
          <Table caption="Time per phase" columns={phaseColumns} rows={s.phases} rowKey={(p) => p.name} dense flush />
        </Plate>
      )}
      {s.slowest.length > 0 && (
        <Plate title="Slowest calls" flush>
          <Table caption="Slowest calls" columns={slowColumns} rows={s.slowest} rowKey={(c) => c.id} dense flush />
        </Plate>
      )}
    </Stack>
  );
}

function FactList({ facts }: { facts: readonly Fact[] }) {
  if (facts.length === 0) return null;
  return (
    <Facts
      items={facts.map((f) => [
        f.label,
        f.mono ? (
          <Text mono small>
            {f.value}
          </Text>
        ) : (
          f.value
        ),
      ])}
    />
  );
}

function Event({ e, scan }: { e: TraceEvent; scan: string | null }) {
  const rule = e.detail.rule;
  return (
    <Stack>
      <Text small>
        <Text muted>{e.kind}</Text> <Text strong>{e.name}</Text> · {e.summary}
      </Text>
      <FactList facts={e.detail.facts} />
      {e.detail.lines.map((l) => (
        <Text key={l} small mono>
          {l}
        </Text>
      ))}
      {rule && scan && (
        <Text small href={`/app/scans/${encodeURIComponent(scan)}/decisions?rule=${encodeURIComponent(rule)}`}>
          Decision log for {rule}
        </Text>
      )}
    </Stack>
  );
}

function Phases({ span, open }: { span: string; open: boolean }) {
  const q = useSpanChildren(span, open);
  if (!open) return null;
  return (
    <QueryState query={q} what="the phases">
      {(d) =>
        d.phases.length === 0 && d.events.length === 0 ? (
          <Text small muted block>
            No phase or event detail recorded for this call. It predates phase tracing, or ran at trace level “off”.
          </Text>
        ) : (
          <Stack>
            {d.phases.map((p) => (
              <Stack key={p.name}>
                <Cluster>
                  <Text mono small>
                    {p.name}
                  </Text>
                  <ShownStatus status={p.status} />
                  <Text small>{`${p.duration} · ${String(p.share)}%`}</Text>
                </Cluster>
                {p.events.map((e, i) => (
                  <Event key={i} e={e} scan={d.scan} />
                ))}
              </Stack>
            ))}
            {d.events.map((e, i) => (
              <Event key={`top-${String(i)}`} e={e} scan={d.scan} />
            ))}
          </Stack>
        )
      }
    </QueryState>
  );
}

function Call({ c }: { c: TraceCall }) {
  const [open, setOpen] = useState(false);
  const agent = c.agent;
  const notImported = 'Not imported. Run pnpm trace:import-agent --agent-id <id>';
  return (
    <Row {...(c.between_calls ? { tone: 'muted' as const } : {})}>
      <Disclosure
        onToggle={setOpen}
        summary={
          <Cluster>
            <Text mono>{`#${String(c.seq)}`}</Text>
            <Text mono>{c.name}</Text>
            <ShownStatus status={c.status} />
            <Text mono small>
              {c.duration}
            </Text>
            <Text small muted={!c.rationale}>
              {c.rationale ? `Agent-stated: ${c.rationale}` : 'No rationale recorded'}
            </Text>
          </Cluster>
        }
      >
        <Stack>
          <Facts
            items={[
              ['Agent tokens', agent.imported ? (agent.tokens ?? 'No matching agent turn') : notImported],
              ['Preceding agent text', agent.imported ? (agent.text ?? 'None') : 'Not imported'],
              [
                'tool_use_id',
                <Text mono small>
                  {c.tool_use_id ?? '—'}
                </Text>,
              ],
              ['Payload', c.payload ? <EvidenceRef e={c.payload} /> : 'None stored'],
            ]}
          />
          <Disclosure summary="Input / attrs">
            <Code>{c.attrs}</Code>
          </Disclosure>
          {c.pw_trace && (
            <Stack>
              <SubHead>Playwright trace</SubHead>
              <Code>{c.pw_trace}</Code>
            </Stack>
          )}
          <Phases span={c.id} open={open} />
        </Stack>
      </Disclosure>
    </Row>
  );
}

function Filters({ d }: { d: TraceCalls }) {
  const { setFilter, toggle } = useSectionParams();
  return (
    <Cluster>
      <Fieldset legend="Tool">
        {d.tool_options.map((o) => (
          <Check key={o.value} label={o.label} checked={d.filter.tool.includes(o.value)} onChange={(e) => toggle('tool', o.value, e.target.checked)} />
        ))}
      </Fieldset>
      <Fieldset legend="Status">
        {d.status_options.map((o) => (
          <Check key={o.value} label={o.label} checked={d.filter.status.includes(o.value)} onChange={(e) => toggle('status', o.value, e.target.checked)} />
        ))}
      </Fieldset>
      <Check label="Problems only" checked={d.filter.problems} onChange={(e) => setFilter('problems', e.target.checked ? 'true' : '')} />
    </Cluster>
  );
}

function emptyText(d: TraceCalls) {
  const filtered = d.filter.tool.length > 0 || d.filter.status.length > 0;
  if (!filtered && !d.filter.problems) return 'No trace recorded for this scan. It predates tracing or never reached the server.';
  if (!filtered) return 'No problems in this scan. Every call and decision completed as expected.';
  return 'No calls match these filters. Clear the tool, status or problems filters.';
}

function Calls({ scan }: { scan: string }) {
  const { params } = useSectionParams();
  const q = useTraceCalls(scan, params);
  return (
    <QueryState query={q} what="the tool calls">
      {(d) => (
        <Stack>
          <Filters d={d} />
          {d.items.length === 0 ? (
            <Plate title="Tool calls · 0">
              <Text small muted block>
                {emptyText(d)}
              </Text>
            </Plate>
          ) : (
            <Plate title={`Tool calls · ${String(d.total)}`} flush>
              <Rows label="Tool calls">
                {d.items.map((c) => (
                  <Call key={c.id} c={c} />
                ))}
              </Rows>
            </Plate>
          )}
          <CursorPager total={d.total} nextCursor={d.next_cursor} />
          {d.unmatched.length > 0 && (
            <Plate title={`Never reached the server · ${String(d.unmatched.length)}`}>
              <Rows label="Agent calls that never reached the server">
                {d.unmatched.map((u, i) => (
                  <Row key={i} aside={<Text mono small>{u.at}</Text>}>
                    <Text mono>{u.tool}</Text>
                    {u.text && (
                      <Text small muted block>
                        {u.text}
                      </Text>
                    )}
                  </Row>
                ))}
              </Rows>
            </Plate>
          )}
        </Stack>
      )}
    </QueryState>
  );
}

/** A scan's Trace: the summary, then every tool call with the agent's context and, once opened, its phases and events. */
export function TraceSection({ scan }: { scan: string }) {
  const q = useTraceSummary(scan);
  return (
    <Stack>
      <QueryState query={q} what="the trace summary">
        {(s) => <Summary s={s} />}
      </QueryState>
      <Calls scan={scan} />
    </Stack>
  );
}
