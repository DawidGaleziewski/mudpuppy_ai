import { Chip, Cluster, Code, Disclosure, Plate, Stack, Table, Text } from '../design-system';
import { useSection, type ActionRow, type Count, type DecisionRow, type DecisionsTab, type FrontierRow } from '../app/api-scan-tabs';
import { QueryState } from '../app/QueryState';
import { CursorPager, SectionFilter, useSectionParams } from '../app/SectionPaging';
import { ShownStatus } from '../app/ShownStatus';

/** The counts above a section's table, one chip each ("read · Allowed · 441"). */
function Counts({ label, counts }: { label: string; counts: readonly Count[] }) {
  return (
    <Cluster>
      <Text small muted>
        {label}
      </Text>
      {counts.map((c) => (
        <Chip key={`${c.value}-${c.also?.word ?? ''}`}>
          {[c.status.word, c.also?.word, String(c.count)].filter(Boolean).join(' · ')}
        </Chip>
      ))}
    </Cluster>
  );
}

const actionColumns = [
  { header: 'Accessible name', rowHeader: true, cell: (a: ActionRow) => <Text asIs>{a.name ?? '—'}</Text> },
  { header: 'Role', cell: (a: ActionRow) => <Text mono small>{a.role}</Text> },
  { header: 'Safety class', cell: (a: ActionRow) => <Text mono small>{a.safety}</Text> },
  {
    header: 'Decision',
    cell: (a: ActionRow) => (
      <Stack>
        <ShownStatus status={a.decision} />
        {a.skip_reason && (
          <Text small muted>
            {a.skip_reason}
          </Text>
        )}
      </Stack>
    ),
  },
  { header: 'Top locator', cell: (a: ActionRow) => <Text mono small>{a.locator ?? '—'}</Text> },
  { header: 'Links to', cell: (a: ActionRow) => <Text route>{a.href ?? '—'}</Text> },
];

export function ActionsSection({ scan }: { scan: string }) {
  const { params } = useSectionParams();
  const q = useSection(scan, 'actions', params);
  return (
    <QueryState query={q} what="the actions">
      {(d) => (
        <Stack>
          <Cluster>
            <SectionFilter label="Safety class" name="safety_class" value={d.filter.safety_class} options={d.safety_options} any="Any class" />
            <SectionFilter label="Decision" name="allowed" value={d.filter.allowed} options={d.allowed_options} any="Any decision" />
          </Cluster>
          <Counts label="By safety class and decision" counts={d.counts} />
          <Plate title={`Actions extracted · ${String(d.total)}`} flush>
            <Table
              caption="Actions extracted in this scan"
              columns={actionColumns}
              rows={d.items}
              rowKey={(a) => a.id}
              flush
              empty={
                d.filter.safety_class || d.filter.allowed
                  ? 'No actions match these filters.'
                  : 'No actions extracted in this scan. Actions are the controls the crawler found on each screen, classified before anything is clicked.'
              }
            />
          </Plate>
          <CursorPager total={d.total} nextCursor={d.next_cursor} />
        </Stack>
      )}
    </QueryState>
  );
}

const frontierColumns = [
  { header: 'Status', cell: (f: FrontierRow) => <ShownStatus status={f.status} /> },
  {
    header: 'Action',
    rowHeader: true,
    cell: (f: FrontierRow) => (
      <Cluster>
        {f.role && (
          <Text mono small>
            {f.role}
          </Text>
        )}
        <Text asIs>{f.name ?? ''}</Text>
        {f.href && <Text route>{`→ ${f.href}`}</Text>}
      </Cluster>
    ),
  },
  { header: 'Safety class', cell: (f: FrontierRow) => <Text mono small>{f.safety}</Text> },
  { header: 'Depth', numeric: true, cell: (f: FrontierRow) => f.depth },
  { header: 'Priority', numeric: true, cell: (f: FrontierRow) => f.priority },
  { header: 'Reason', cell: (f: FrontierRow) => f.reason ?? '—' },
];

export function FrontierSection({ scan }: { scan: string }) {
  const { params } = useSectionParams();
  const q = useSection(scan, 'frontier', params);
  return (
    <QueryState query={q} what="the frontier">
      {(d) => (
        <Stack>
          <SectionFilter label="Status" name="status" value={d.filter.status} options={d.status_options} any="Any status" />
          <Counts label="By status" counts={d.counts} />
          <Plate title={`Frontier · ${String(d.total)}`} flush>
            <Table
              caption="Frontier items"
              columns={frontierColumns}
              rows={d.items}
              rowKey={(f) => f.id}
              flush
              empty={
                d.filter.status
                  ? 'No frontier items with this status.'
                  : 'No frontier items in this scan. The frontier is the queue of actions the crawler planned, did, or refused.'
              }
            />
          </Plate>
          <CursorPager total={d.total} nextCursor={d.next_cursor} />
        </Stack>
      )}
    </QueryState>
  );
}

const decisionColumns = [
  { header: 'Kind', cell: (d: DecisionRow) => <ShownStatus status={d.kind} /> },
  { header: 'Rule', cell: (d: DecisionRow) => <Text mono small>{d.rule ?? '—'}</Text> },
  {
    header: 'Reason',
    rowHeader: true,
    cell: (d: DecisionRow) => (
      <Stack>
        <Text asIs>{d.reason}</Text>
        {d.detail !== null && (
          <Disclosure summary="Detail">
            <Code>{d.detail}</Code>
          </Disclosure>
        )}
      </Stack>
    ),
  },
  { header: 'Subject', cell: (d: DecisionRow) => <Text mono small>{d.subject ?? '—'}</Text> },
  { header: 'At (UTC)', cell: (d: DecisionRow) => <Text mono small>{d.at}</Text> },
];

type Group = DecisionsTab['groups'][number];

const groupColumns = [
  { header: 'Kind', cell: (g: Group) => <ShownStatus status={g.kind} /> },
  { header: 'Rule', rowHeader: true, cell: (g: Group) => <Text mono small>{g.rule ?? '—'}</Text> },
  { header: 'Count', numeric: true, cell: (g: Group) => g.count },
  { header: 'Example reason', cell: (g: Group) => <Text asIs>{g.example}</Text> },
];

export function DecisionsSection({ scan }: { scan: string }) {
  const { params } = useSectionParams();
  const q = useSection(scan, 'decisions', params);
  return (
    <QueryState query={q} what="the decision log">
      {(d) => (
        <Stack>
          <Plate title={`Decision log · ${String(d.groups.reduce((a, g) => a + g.count, 0))}`} flush>
            <Table caption="Decisions by rule" columns={groupColumns} rows={d.groups} rowKey={(g) => `${g.kind.word}-${g.rule ?? ''}`} dense flush />
          </Plate>
          <Cluster>
            <SectionFilter label="Kind" name="kind" value={d.filter.kind} options={d.kind_options} any="Any kind" />
            <SectionFilter label="Rule" name="rule" value={d.filter.rule} options={d.rule_options} any="Any rule" />
          </Cluster>
          <Plate title={`Entries · ${String(d.total)}`} flush>
            <Table
              caption="Decision log entries"
              columns={decisionColumns}
              rows={d.items}
              rowKey={(e) => e.id}
              flush
              empty={
                d.filter.kind || d.filter.rule
                  ? 'No decisions match these filters.'
                  : 'No decisions logged in this scan. Every skip, refusal, merge, split and warning is logged with the rule that applied.'
              }
            />
          </Plate>
          <CursorPager total={d.total} nextCursor={d.next_cursor} />
        </Stack>
      )}
    </QueryState>
  );
}
