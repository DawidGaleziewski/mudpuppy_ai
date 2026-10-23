import { useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Check, Cluster, Columns, Disclosure, Field, Note, PageHead, Plate, Row, Rows, Select, Stack, Table, Tag, Text, ViewNav } from '../design-system';
import { useReviewKeys } from '../app/useReviewKeys';
import { changeHref } from '../app/api-changes';
import { reviewHref, reviewKey, useReview, type ReviewPage, type ReviewView } from '../app/api-review';
import { ruleHref } from '../app/api-rules';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';
import { ReviewDetail } from './ReviewDetail';
import { Group } from './ReviewRows';

const TAB_LABELS = [
  ['needs', 'Needs you'],
  ['explained', 'Explained automatically'],
  ['decided', 'Decided'],
] as const;

function TabNav({ page }: { page: ReviewPage }) {
  const counts = { needs: page.total, explained: page.explained_count, decided: page.decided_count };
  const items: { href: string; label: string; count: number; current: boolean }[] = TAB_LABELS.map(([tab, label]) => ({
    href: reviewHref(page.portal, { tab }),
    label,
    count: counts[tab],
    current: page.tab === tab,
  }));
  // Same screen? (v2-14) is its own page, one pair at a time; still on htmx.
  if (page.same_screen_pairs) items.push({ href: `/same-screen?portal=${encodeURIComponent(page.portal)}`, label: 'Same screen?', count: page.same_screen_pairs, current: false });
  return <ViewNav label="Review views" items={items} />;
}

function Filters({ page, view }: { page: ReviewPage; view: ReviewView }) {
  const f = page.filters;
  const navigate = useNavigate();
  const [part, setPart] = useState(f?.part ?? '');
  const [age, setAge] = useState(f?.age ?? '');
  if (!f) return null;
  return (
    <Cluster>
      <Field label="Part">
        <Select value={part} onChange={(e) => setPart(e.target.value)}>
          <option value="">Every part</option>
          {f.parts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Age">
        <Select value={age} onChange={(e) => setAge(e.target.value)}>
          <option value="">Any age</option>
          {f.ages.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button size="md" onClick={() => void navigate(reviewHref(page.portal, { show: view.show, part, age }))}>
        Filter
      </Button>
      {f.active && <Text href={reviewHref(page.portal, { show: view.show })}>Clear filters</Text>}
    </Cluster>
  );
}

const KEYS = [
  ['J / K', 'Next / previous item'],
  ['C', 'Confirm the selected item (it asks first)'],
  ['R', 'Reject: to the reason, which a reject needs'],
  ['U', 'Undo the last decision'],
  ['?', 'This list'],
] as const;

/** The keys of the inbox (designer § 5.2) and the switch that turns them off in this browser. */
function KeysHelp({ page }: { page: ReviewPage }) {
  const navigate = useNavigate();
  const [shown, setShown] = useState(0);
  const nb = page.neighbours;
  const move = useCallback(
    (step: 1 | -1) => {
      const to = step === 1 ? nb?.next : nb?.prev;
      if (to) void navigate(reviewHref(page.portal, { show: page.show ?? undefined, select: to }));
    },
    [navigate, nb, page.portal, page.show],
  );
  const help = useCallback(() => setShown((n) => n + 1), []);
  const { on, turn } = useReviewKeys({ move, help });
  return (
    <Disclosure key={shown} open={shown > 0} summary={on ? 'Keys: J K next · previous · C confirm · R reject · U undo · ? all' : 'Single-key shortcuts are off'}>
      <Stack>
        <Table caption="Review shortcuts" columns={[{ header: 'Key', cell: (k) => <Text mono>{k[0]}</Text>, rowHeader: true }, { header: 'Does', cell: (k) => k[1] }]} rows={[...KEYS]} rowKey={(k) => k[0]} dense />
        <Check label="Single-key shortcuts in this browser" checked={on} onChange={(e) => turn(e.target.checked)} />
      </Stack>
    </Disclosure>
  );
}

function Inbox({ page, view, ask }: { page: ReviewPage; view: ReviewView; ask: (a: Ask) => void }) {
  const kinds = [
    { href: reviewHref(page.portal), label: 'All', count: page.total, current: !page.show },
    ...page.kinds.map((k) => ({ href: reviewHref(page.portal, { show: k.value }), label: k.label, count: page.counts[k.value] ?? 0, current: page.show === k.value })),
  ];
  const firstWithRows = page.groups.find((g) => g.count > 0)?.kind;
  return (
    <Stack>
      <ViewNav label="Kinds of decision" items={kinds} />
      <Filters page={page} view={view} />
      <KeysHelp page={page} />
      <Columns
        main={
          <Stack>
            {page.groups.map((g) => (
              <Group key={g.kind} page={page} group={g} intent={g.kind === firstWithRows} ask={ask} />
            ))}
            {page.empty_kinds.length > 0 && (
              <Cluster>
                <Text small muted>
                  Nothing waits in
                </Text>
                {page.empty_kinds.map((k) => (
                  <Text key={k.value} small href={reviewHref(page.portal, { show: k.value })}>
                    {k.label}
                  </Text>
                ))}
              </Cluster>
            )}
          </Stack>
        }
        side={<ReviewDetail page={page} ask={ask} />}
      />
    </Stack>
  );
}

function Explained({ page }: { page: ReviewPage }) {
  return (
    <Plate title="Explained automatically" actions={<Text small muted>newest first · reviewing is optional</Text>} flush foot={<Text small muted>Overturning an automatic explanation comes later (roadmap R-87).</Text>}>
      <Table
        caption="Changes a rule explained"
        columns={[
          { header: 'Change', cell: (c) => <Stack><Cluster><ShownChip chip={{ word: c.word, variant: null }} />{c.screen && <Tag size="sm">{c.screen}</Tag>}</Cluster><Text asIs>{c.finding}</Text></Stack>, rowHeader: true },
          { header: 'Explanation', cell: (c) => <Stack><ShownChip chip={c.explanation} /><Text small muted>{c.explanation_text}</Text></Stack> },
          { header: 'Rule', cell: (c) => <Text mono>{c.rule ?? '—'}</Text> },
          { header: 'When', cell: (c) => <Text mono small muted>{c.at}</Text> },
          { header: 'Open', cell: (c) => <Text small href={changeHref(page.portal, c.id)}>Before / after</Text> },
        ]}
        rows={page.explained}
        rowKey={(c) => c.id}
        dense
        flush
        empty="No change was explained automatically yet. Changes start after the second scan."
      />
    </Plate>
  );
}

function Decided({ page }: { page: ReviewPage }) {
  return (
    <Plate title="Decided" actions={<Text small muted>a person&apos;s decisions on the portal model, newest first</Text>}>
      {page.decided.length ? (
        <Rows label="Decisions">
          {page.decided.map((d, i) => (
            <Row key={`${d.key}-${String(i)}`}>
              <Cluster>
                <Tag size="sm" {...(d.is_rule ? { href: ruleHref(page.portal, d.key) } : {})}>
                  {d.key}
                </Tag>
                <ShownStatus status={d.status} />
                {d.undone && <ShownChip chip={{ word: 'Undone', variant: 'dashed' }} />}
                <Text small muted>{d.kind}</Text>
              </Cluster>
              <Text asIs>{d.claim}</Text>
              {d.reason ? (
                <Note size="sm" by={`${d.actor} · ${d.at}`}>
                  {d.reason}
                </Note>
              ) : (
                <Text small muted>{`${d.actor} · ${d.at}`}</Text>
              )}
            </Row>
          ))}
        </Rows>
      ) : (
        <Text small muted>
          Nothing decided yet. Your confirmations and rejections land here with their reasons, and stay.
        </Text>
      )}
    </Plate>
  );
}

/** Review (designer screens v2-04, v2-05, v2-16): what needs a person, what a rule explained, what was decided. */
export function Review() {
  const portal = useParams().portal ?? '';
  const [params] = useSearchParams();
  const get = (k: string) => params.get(k) ?? undefined;
  const view: ReviewView = { tab: get('tab'), show: get('show'), select: get('select'), page: Number(get('page') ?? 1), part: get('part'), age: get('age') };
  const q = useReview(portal, view);
  const { ask, view: writeView } = useConfirmedWrite(reviewKey(portal));
  const meta = q.data ? `${String(q.data.total)} need you · ${String(q.data.explained_count)} explained automatically · nothing is decided without a reason you can see later.` : undefined;
  return (
    <Shell current="review">
      <PageHead crumbs={[{ label: 'Portals', href: '/app/' }, { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` }, { label: 'Review' }]} title="Review" meta={meta} />
      <QueryState query={q} what="Review">
        {(page) => (
          <Stack>
            <TabNav page={page} />
            {writeView}
            {page.tab === 'explained' && <Explained page={page} />}
            {page.tab === 'decided' && <Decided page={page} />}
            {page.tab === 'needs' && <Inbox page={page} view={view} ask={ask} />}
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
