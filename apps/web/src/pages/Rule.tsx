import { useState } from 'react';
import { useParams } from 'react-router';
import { Button, Callout, Chip, Cluster, Code, DecisionTable, Disclosure, Field, Input, LinkButton, Note, PageHead, Plate, Stack, Table, Tag, Text, Textarea, Timeline, TimelineItem } from '../design-system';
import { rulesHref, rulesKey, ruleWrites, useRule, useRuleExport, type RuleExport, type RulePage } from '../app/api-rules';
import { reviewHref } from '../app/api-review';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

const screenHref = (portal: string, key: string) => `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}`;

/** Documented as, found as, decided on, fit: the rule's meta line. */
function Meta({ r }: { r: RulePage }) {
  const row = r.row;
  return (
    <Cluster>
      <ShownStatus status={row.status} />
      {r.br_key && (
        <>
          <Text small>Documented as</Text>
          <Tag size="sm" {...(r.doc_href ? { href: r.doc_href } : {})}>
            {r.br_key}
          </Tag>
          <Text small>found as</Text>
          <Tag size="sm">{row.key}</Tag>
        </>
      )}
      {r.uncited && <Text small>{`No business rule record cites ${row.key} yet`}</Text>}
      {row.screen_key && (
        <>
          <Text small>Decided on</Text>
          <Tag size="sm" href={screenHref(r.portal, row.screen_key)}>
            {row.screen_key}
          </Tag>
          {row.screen_title && <Text small asIs>{row.screen_title}</Text>}
          {row.action && <Text mono small>{row.action}</Text>}
        </>
      )}
      {r.fitness !== null && <Text small>{`fit ${String(r.fitness)}${r.executions ? ` on ${String(r.executions)} executions` : ''}`}</Text>}
    </Cluster>
  );
}

/** v2-12 "In the documentation": the wording in force, and Reword (asks first). */
function Wording({ r, ask }: { r: RulePage; ask: (a: Ask) => void }) {
  const now = r.wordings[0];
  const [wording, setWording] = useState(now?.wording ?? '');
  const [reason, setReason] = useState('');
  const save = () =>
    ask({
      title: `Reword ${r.row.shown_key}?`,
      text: `"${wording.trim()}" goes into the documentation and the export in place of the mined sentence.`,
      confirm: 'Save the wording',
      write: ruleWrites.reword(r.portal, r.row.key, wording.trim(), reason.trim()),
    });
  return (
    <Plate title="In the documentation" actions={<Text small muted>{now ? `reworded by ${now.actor} · ${now.at}` : 'the mined sentence, in the export'}</Text>}>
      <Stack>
        {now ? (
          <Text asIs block>
            {now.wording}
          </Text>
        ) : (
          <Text small muted>
            No one has reworded it yet: the export says each table row as a sentence (&quot;If … leads to …&quot;). Reword it when the business says it differently.
          </Text>
        )}
        <Disclosure summary={r.wordings.length > 1 ? `Reword · ${String(r.wordings.length)} wordings so far` : 'Reword'}>
          <Stack>
            {r.writes ? (
              <>
                <Field label="Sentence">
                  <Textarea rows={3} maxLength={2000} value={wording} placeholder="The driver must be 21 or older on the day of the quote." onChange={(e) => setWording(e.target.value)} />
                </Field>
                <Field label="Why">
                  <Input maxLength={200} value={reason} placeholder="Optional: the terms say it this way" onChange={(e) => setReason(e.target.value)} />
                </Field>
                <Cluster>
                  <Button size="md" disabled={!wording.trim()} onClick={save}>
                    Save the wording
                  </Button>
                </Cluster>
              </>
            ) : (
              <Text small muted>
                Set MUDPUPPY_REVIEWER to your name to reword rules.
              </Text>
            )}
            {r.wordings.slice(1).map((w) => (
              <Note key={w.at} size="sm" by={`${w.actor} · ${w.at}`}>
                {w.wording}
              </Note>
            ))}
          </Stack>
        </Disclosure>
      </Stack>
    </Plate>
  );
}

function Decision({ r }: { r: RulePage }) {
  const t = r.table;
  return (
    <Plate title="Decision table">
      {t ? (
        <Stack>
          <DecisionTable
            label={`${r.row.shown_key} decision table`}
            inputs={t.inputs}
            result="→ Next screen"
            facts={[
              ['Inputs', t.inputs.join(', ')],
              ['Hit policy', `${t.hit_policy}: rows are checked top to bottom.`],
            ]}
            rows={t.rows.map((row) => ({
              conditions: row.cells.map((c) => (c.any ? null : c.cond)),
              result: (
                <Cluster>
                  {row.is_screen ? (
                    <Tag size="sm" href={screenHref(r.portal, row.screen)}>
                      {row.screen}
                    </Tag>
                  ) : (
                    <Text asIs>{row.screen}</Text>
                  )}
                  {row.result && <Chip>{row.result}</Chip>}
                </Cluster>
              ),
            }))}
          />
        </Stack>
      ) : (
        <Text small drawn>
          Decided on data not visible from the UI, or too few executions to state the rule yet.
        </Text>
      )}
    </Plate>
  );
}

function Tests({ r }: { r: RulePage }) {
  return (
    <Plate title="Boundary tests" flush={r.tests.length > 0}>
      {r.tests.length ? (
        <Table
          caption="Boundary tests"
          columns={[
            { header: 'Inputs', cell: (t) => <Stack>{t.inputs.map((i) => <Text key={i} mono small>{i}</Text>)}</Stack>, rowHeader: true },
            { header: 'Expected', cell: (t) => <Text small>{t.expect}</Text> },
            { header: 'Got', cell: (t) => <Text small>{t.got ?? '—'}</Text> },
            { header: 'Result', cell: (t) => <ShownStatus status={t.verdict} /> },
          ]}
          rows={r.tests}
          rowKey={(t) => t.inputs.join('|')}
          dense
          flush
        />
      ) : (
        <Text small muted>
          No boundary test yet.
        </Text>
      )}
    </Plate>
  );
}

function History({ r }: { r: RulePage }) {
  return (
    <Plate
      title="History"
      foot={
        <Text small muted>
          Confirm or reject a rule in <Text href={reviewHref(r.portal, { show: 'rules' })}>Review</Text>, or with <Text mono>{`pnpm model:decide ${r.portal} ${r.row.key}`}</Text>.
        </Text>
      }
    >
      <Timeline label="History">
        {r.history.map((e, i) => (
          <TimelineItem
            key={i}
            status={e.mark}
            head={
              <Cluster>
                <ShownStatus status={e.status} />
                <Text small muted>{`${e.undo ? 'Undone · ' : ''}${e.at} · ${e.actor}`}</Text>
              </Cluster>
            }
          >
            {e.by_person ? (
              <Note size="sm" by={`${e.actor} · ${e.at}`}>
                {e.reason}
              </Note>
            ) : (
              <Text small>{e.reason}</Text>
            )}
          </TimelineItem>
        ))}
      </Timeline>
    </Plate>
  );
}

/** v2-12 "In the export" (OV-5): built by the export command, so it loads after the page. */
function InTheExport({ r }: { r: RulePage }) {
  const q = useRuleExport(r.portal, r.row.shown_key);
  const md = q.data?.markdown;
  return (
    <Plate
      title="In the export"
      variant="drawn"
      foot={
        md ? (
          <Cluster>
            {r.files.map((f) => (
              <LinkButton key={f.label} size="sm" variant="quiet" href={f.value}>
                {f.label}
              </LinkButton>
            ))}
          </Cluster>
        ) : undefined
      }
    >
      <QueryState query={q} what="the export">
        {(x) => <ExportBody shown={r.row.shown_key} x={x} />}
      </QueryState>
    </Plate>
  );
}

function ExportBody({ shown, x }: { shown: string; x: RuleExport }) {
  if (x.markdown) {
    return (
      <Stack>
        <Text small>{`The migration team reads ${shown} like this: plain Markdown, the sentence first for readers who skip tables, then the exact table.`}</Text>
        <Code>{x.markdown}</Code>
      </Stack>
    );
  }
  if (x.error) {
    return (
      <Text small>
        The export could not be built: <Text mono>{x.error}</Text>. The rest of this page still works.
      </Text>
    );
  }
  return <Text small muted>{`${shown} has no decision table yet, so it is not in the export.`}</Text>;
}

function Body({ r, ask }: { r: RulePage; ask: (a: Ask) => void }) {
  return (
    <Stack>
      <Meta r={r} />
      {r.changed && (
        <Callout>
          It no longer holds on a newer release (see History). Mine it again on the new release: <Text mono>{`pnpm model:mine ${r.portal}`}</Text>.
        </Callout>
      )}
      <Wording r={r} ask={ask} />
      <Decision r={r} />
      <Tests r={r} />
      <History r={r} />
      <InTheExport r={r} />
    </Stack>
  );
}

/** One business rule (designer screen v2-12): its wording, decision table, tests, history and export. */
export function Rule() {
  const { portal = '', key = '' } = useParams();
  const q = useRule(portal, key);
  const { ask, view } = useConfirmedWrite(rulesKey(portal));
  const row = q.data?.row;
  const title = row ? (
    <>
      <Tag>{row.shown_key}</Tag> <Text asIs>{row.claim}</Text>
    </>
  ) : (
    key
  );
  return (
    <Shell current="rules">
      <PageHead crumbs={[{ label: 'Portals', href: '/app/' }, { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` }, { label: 'Rules', href: rulesHref(portal) }, { label: row?.shown_key ?? key }]} title={title} />
      {view}
      <QueryState query={q} what="the rule">
        {(r) => <Body r={r} ask={ask} />}
      </QueryState>
    </Shell>
  );
}
