import { useParams, useSearchParams } from 'react-router';
import { Button, Callout, Cluster, PageHead, Plate, Stack, Table, Tag, Text, ViewNav } from '../design-system';
import { ruleHref, rulesHref, rulesKey, ruleWrites, useRules, type RuleRow, type RulesPage } from '../app/api-rules';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

const screenHref = (portal: string, key: string) => `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}`;

function columns(portal: string) {
  return [
    {
      header: 'Rule',
      rowHeader: true,
      cell: (r: RuleRow) => (
        <Stack>
          <Cluster>
            <Tag size="sm" href={ruleHref(portal, r.shown_key)}>
              {r.shown_key}
            </Tag>
          </Cluster>
          <Text asIs href={ruleHref(portal, r.shown_key)}>
            {r.claim}
          </Text>
        </Stack>
      ),
    },
    {
      header: 'Where decided',
      cell: (r: RuleRow) =>
        r.screen_key ? (
          <Stack>
            <Text asIs href={screenHref(portal, r.screen_key)}>
              {r.screen_title ?? r.screen_key}
            </Text>
            {r.action && <Text mono small muted>{r.action}</Text>}
          </Stack>
        ) : (
          <Text muted>—</Text>
        ),
    },
    { header: 'Status', cell: (r: RuleRow) => <ShownStatus status={r.status} /> },
    { header: 'Boundary tests', cell: (r: RuleRow) => <Text small>{`${String(r.passed)} pass · ${String(r.failed)} fail${r.waiting ? ` · ${String(r.waiting)} waiting` : ''}`}</Text> },
    { header: 'Last tested', cell: (r: RuleRow) => (r.last_tested ? <Text mono small>{r.last_tested}</Text> : <Text small muted>Not tested</Text>) },
  ];
}

function RunTests({ page, ask }: { page: RulesPage; ask: (a: Ask) => void }) {
  if (!page.writes) {
    return (
      <Text small muted>
        Set MUDPUPPY_REVIEWER to your name to start check runs.
      </Text>
    );
  }
  return (
    <Button
      size="sm"
      onClick={() =>
        ask({
          title: 'Run the rule tests?',
          text: 'The rule tests and error replays run on the headless driver, without AI. The model takes the results on its next rebuild.',
          confirm: 'Run the rule tests',
          write: ruleWrites.replay(page.portal),
        })
      }
    >
      Run the rule tests
    </Button>
  );
}

function Body({ page, ask }: { page: RulesPage; ask: (a: Ask) => void }) {
  if (!page.total) {
    return (
      <Stack>
        <RunTests page={page} ask={ask} />
        <Callout>
          No business rule yet. Where an action leads to different screens depending on what was typed, mining finds the rule: <Text mono>{`pnpm model:mine ${page.portal}`}</Text>. Check runs then test it: <Text mono>{`pnpm model:replay ${page.portal}`}</Text>.
        </Callout>
      </Stack>
    );
  }
  const items = [
    { href: rulesHref(page.portal), label: 'All', count: page.total, current: page.status === null },
    ...page.statuses.map((s) => ({ href: rulesHref(page.portal, s.value), label: s.label, current: page.status === s.value })),
  ];
  return (
    <Stack>
      <Cluster>
        <RunTests page={page} ask={ask} />
        <Text small>Export:</Text>
        <Text small href={page.export.zip}>
          all rules (DMN, Markdown, CSV)
        </Text>
        <Text small href={page.export.csv}>
          rules.csv
        </Text>
      </Cluster>
      <ViewNav label="Status" items={items} />
      {page.groups.map((g) => (
        <Plate key={g.status.word} title={`${g.status.word} · ${String(g.rules.length)}`} flush>
          <Table caption={`${g.status.word} rules`} columns={columns(page.portal)} rows={g.rules} rowKey={(r) => r.key} flush />
        </Plate>
      ))}
    </Stack>
  );
}

/** Business rules (designer screen v2-11): every rule, where it is decided, its status and tests. */
export function Rules() {
  const portal = useParams().portal ?? '';
  const [params] = useSearchParams();
  const q = useRules(portal, params.get('status') ?? undefined);
  const { ask, view } = useConfirmedWrite(rulesKey(portal));
  const meta = q.data ? [`${String(q.data.total)} rules`, ...q.data.statuses.map((s) => s.label.toLowerCase())].join(' · ') : undefined;
  return (
    <Shell current="rules">
      <PageHead crumbs={[{ label: 'Portals', href: '/app/' }, { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` }, { label: 'Rules' }]} title="Business rules" meta={meta} />
      <Text small muted>
        Each rule is a decision table the system found from the portal&apos;s behaviour. Check runs test it at its boundaries.
      </Text>
      {view}
      <QueryState query={q} what="the rules">
        {(page) => <Body page={page} ask={ask} />}
      </QueryState>
    </Shell>
  );
}
