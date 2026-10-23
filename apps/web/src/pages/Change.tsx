import { useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Cluster, Columns, Compare, CompareSide, Field, Input, LinkButton, PageHead, Plate, Row, Rows, ScanId, Shot, Split, Stack, SubHead, Table, Tag, Text, ViewNav } from '../design-system';
import { changeHref, changesHref, changesKey, useChange, type ChangePage, type ChangeSide, type CompareMode } from '../app/api-changes';
import { processHref } from '../app/api-processes';
import { reviewHref, reviewWrites, undoAsk } from '../app/api-review';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';
import { useReviewKeys } from '../app/useReviewKeys';
import { stateHref } from './RecordedInspector';

const MODES: readonly [CompareMode, string][] = [
  ['side', 'Side by side'],
  ['overlay', 'Overlay'],
  ['wire', 'Wireframe'],
];

const modeOf = (raw: string | null): CompareMode => (raw === 'overlay' || raw === 'wire' ? raw : 'side');

/** One side's page: the screenshot (the wireframe in Wireframe mode or without one), the change marked. */
function SidePicture({ d, s, mode }: { d: ChangePage; s: ChangeSide; mode: CompareMode }) {
  const shot = mode === 'wire' ? null : s.shot;
  const src = shot ?? s.wire;
  if (!s.state_id) return <Text small muted>Nothing recorded on this side.</Text>;
  return (
    <Stack>
      <Cluster>
        {s.status && <ShownStatus status={s.status} />}
        {s.scan && <ScanId id={s.scan} href={`/app/scans/${encodeURIComponent(s.scan)}`} />}
        {s.at && <Text mono small muted>{s.at}</Text>}
      </Cluster>
      {src ? (
        <Shot src={src} alt={`${s.label}: ${s.title ?? s.route ?? 'recorded screen'}${shot ? '' : ' (wireframe)'}`} region={shot ? d.region : null} mark={s.has_change ? 'here' : 'gone'} />
      ) : (
        <Text small muted>
          No picture was recorded.
        </Text>
      )}
      <Text small href={stateHref(s.state_id)}>
        Open the recorded screen
      </Text>
    </Stack>
  );
}

function Pictures({ d, mode }: { d: ChangePage; mode: CompareMode }) {
  const both = d.before.shot && d.after.shot;
  if (mode === 'overlay' && d.before.shot && d.after.shot) {
    return (
      <Stack>
        <Shot src={d.before.shot} alt={d.before.label} over={{ src: d.after.shot, alt: `${d.after.label}, half transparent` }} />
        <Text small muted>{`${d.after.label} over ${d.before.label} at 50%: small shifts show as a double edge.`}</Text>
      </Stack>
    );
  }
  return (
    <Stack>
      {mode === 'overlay' && !both && (
        <Text small muted>
          Overlay needs a screenshot on both sides; shown side by side.
        </Text>
      )}
      <Compare>
        {[d.before, d.after].map((s) => (
          <CompareSide key={s.label} title={s.label} aside={s.title && <Text mono small muted>{s.title}</Text>}>
            <Stack>
              <Text small>{s.note}</Text>
              <SidePicture d={d} s={s} mode={mode} />
            </Stack>
          </CompareSide>
        ))}
      </Compare>
    </Stack>
  );
}

function Differs({ d }: { d: ChangePage }) {
  if (!d.differs.length) {
    return (
      <Text small muted>
        Only one side was recorded, so there is nothing to set side by side.
      </Text>
    );
  }
  return (
    <Stack>
      <Table
        caption="What differs between the two sides"
        columns={[
          { header: 'Context', cell: (x) => x.label, rowHeader: true },
          { header: d.before.label, cell: (x) => <Text mono small asIs>{x.before}</Text> },
          { header: d.after.label, cell: (x) => <Text mono small asIs>{x.after}</Text> },
          { header: 'Same or differs', cell: (x) => (x.differs ? <Text small strong>differs</Text> : <Text small muted>same</Text>) },
        ]}
        rows={d.differs}
        rowKey={(x) => x.label}
        dense
      />
      <Text small muted>
        Each side&apos;s latest recorded visit: the release of each portal part, the persona and the scan.
      </Text>
    </Stack>
  );
}

/** The decision bar (v2-03): the hypothesis decided through Review, asked first, with Undo. */
function Decide({ d, ask }: { d: ChangePage; ask: (a: Ask) => void }) {
  const [reason, setReason] = useState('');
  const key = d.change.hypothesis_key ?? '';
  const decide = (action: 'confirm' | 'reject') =>
    ask({
      title: `${action === 'confirm' ? 'Confirm' : 'Reject'} ${key}?`,
      text: reason ? `Reason: ${reason}` : 'No reason given: "Confirmed in Review." is recorded.',
      confirm: action === 'confirm' ? 'Confirm' : 'Reject',
      write: reviewWrites.decide(d.portal, [key], action, reason),
      undo: undoAsk(d.portal),
    });
  return (
    <Stack>
      <Field label="Reason" help="Needed to reject; optional to confirm.">
        <Input data-review-key="r" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Cluster>
        <Button data-review-key="c" variant="primary" onClick={() => decide('confirm')}>
          Confirm
        </Button>
        <Button size="md" disabled={!reason.trim()} onClick={() => decide('reject')}>
          Reject
        </Button>
      </Cluster>
    </Stack>
  );
}

function Explanation({ d, ask }: { d: ChangePage; ask: (a: Ask) => void }) {
  const ch = d.change;
  return (
    <Plate title={d.explained ? 'Explanation' : 'Proposed explanation'} actions={d.hypothesis_status && <ShownStatus status={d.hypothesis_status} />} {...(d.explained ? {} : { variant: 'drawn' as const })}>
      <Stack>
        <Text block>
          <Text strong>{`${ch.explanation.word}:`}</Text> {ch.explanation_text}
        </Text>
        {ch.hypothesis_key && (
          <Cluster>
            <Tag size="sm">{ch.hypothesis_key}</Tag>
            <Text small asIs>{ch.finding}</Text>
            {d.rule && <Text small muted>{`rule ${d.rule}`}</Text>}
          </Cluster>
        )}
        {d.reason && <Text small muted>{d.reason}</Text>}
        {d.tests.length > 0 && (
          <Stack>
            <SubHead>{`Tests run · ${String(d.tests.length)}`}</SubHead>
            <Rows label="Tests run">
              {d.tests.map((t, i) => (
                <Row key={i} aside={<ShownStatus status={t.verdict} />}>
                  <Text small asIs>{`${t.inputs}${t.result ? ` → ${t.result}` : ''}`}</Text>
                </Row>
              ))}
            </Rows>
          </Stack>
        )}
        {!d.explained && !d.decidable && (
          <Text small muted>
            Not decided until a person confirms it in Review.
          </Text>
        )}
        {d.decidable && <Decide d={d} ask={ask} />}
      </Stack>
    </Plate>
  );
}

function WhereItShows({ d }: { d: ChangePage }) {
  const ch = d.change;
  const screen = `/app/portals/${encodeURIComponent(d.portal)}/screens/${encodeURIComponent(d.screen_key ?? '')}`;
  return (
    <Plate title="Where it shows">
      <Rows label="Where it shows">
        {!d.explained && (
          <Row>
            <Text href={reviewHref(d.portal)}>Review · Needs you</Text>
            <Text small muted>{`${ch.explanation.word} · since ${ch.at}`}</Text>
          </Row>
        )}
        {d.screen_key && (
          <Row aside={<Tag size="sm">{d.screen_key}</Tag>}>
            <Text href={screen}>{d.screen_title ?? d.screen_key}</Text>
            <Text small muted>the screen and its variants</Text>
          </Row>
        )}
        {d.process && (
          <Row aside={<Tag size="sm">{d.process.value}</Tag>}>
            <Text href={processHref(d.portal, d.process.value)}>{d.process.label}</Text>
            <Text small muted>walks this screen</Text>
          </Row>
        )}
        {d.rule_link && (
          <Row>
            <Text href="/rules">Business rules</Text>
            <Text small muted>the rule that decides it</Text>
          </Row>
        )}
      </Rows>
    </Plate>
  );
}

function Neighbours({ d }: { d: ChangePage }) {
  const nb = d.neighbours;
  if (!nb) return null;
  return (
    <Cluster>
      <Text small muted>{`${String(nb.position)} of ${String(nb.total)} that need you`}</Text>
      {nb.prev && (
        <LinkButton size="md" href={changeHref(d.portal, nb.prev)}>
          Previous · K
        </LinkButton>
      )}
      {nb.next && (
        <LinkButton size="md" href={changeHref(d.portal, nb.next)}>
          Next · J
        </LinkButton>
      )}
    </Cluster>
  );
}

function Body({ d, mode, ask }: { d: ChangePage; mode: CompareMode; ask: (a: Ask) => void }) {
  const ch = d.change;
  return (
    <Stack>
      <Split>
        <Stack>
          <SubHead section asIs>
            {ch.finding}
          </SubHead>
          <Cluster>
            <ShownChip chip={ch.word} />
            <Text small muted>{`first seen in model version ${String(ch.model_seq)} · ${ch.at}`}</Text>
            {ch.element_key && <Text mono small>{ch.element_key}</Text>}
          </Cluster>
        </Stack>
        <ViewNav label="Compare as" items={MODES.map(([m, label]) => ({ href: changeHref(d.portal, ch.id, m), label, current: mode === m }))} />
      </Split>
      <Pictures d={d} mode={mode} />
      <Columns
        main={
          <Stack>
            <SubHead section>What differs</SubHead>
            <Differs d={d} />
          </Stack>
        }
        side={
          <Stack>
            <Explanation d={d} ask={ask} />
            <WhereItShows d={d} />
          </Stack>
        }
      />
      <Text small muted>
        Keys: J / K next / previous change · Esc back to What changed
      </Text>
    </Stack>
  );
}

/** Before / after (designer screen v2-03): one change's two recorded pages and its explanation. */
export function Change() {
  const { portal = '', id = '' } = useParams();
  const [params] = useSearchParams();
  const mode = modeOf(params.get('mode'));
  const navigate = useNavigate();
  const q = useChange(portal, id);
  const { ask, view } = useConfirmedWrite(changesKey(portal));
  const d = q.data;
  const move = useCallback(
    (step: 1 | -1) => {
      const to = step === 1 ? d?.neighbours?.next : d?.neighbours?.prev;
      if (to) void navigate(changeHref(portal, to, mode));
    },
    [d, navigate, portal, mode],
  );
  const back = useCallback(() => void navigate(d?.back ?? changesHref(portal)), [d, navigate, portal]);
  useReviewKeys({ move, back });
  const crumbs = [
    { label: 'Portals', href: '/app/' },
    { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
    { label: 'Changes', href: changesHref(portal) },
    ...(d?.process ? [{ label: d.process.label, href: d.back }] : []),
    { label: d?.screen_title ?? 'Before / after' },
  ];
  const meta = d && (
    <Cluster>
      <ShownStatus status={d.change.status} />
      <ShownChip chip={d.change.explanation} />
      {d.screen_key && <Tag size="sm">{d.screen_key}</Tag>}
      {d.screen_title && <Text asIs>{d.screen_title}</Text>}
      {d.screen_route && <Text route>{d.screen_route}</Text>}
    </Cluster>
  );
  return (
    <Shell current="changes">
      <PageHead crumbs={crumbs} title="Before / after" meta={meta} actions={d && <Neighbours d={d} />} />
      {view}
      <QueryState query={q} what="the change">
        {(page) => <Body d={page} mode={mode} ask={ask} />}
      </QueryState>
    </Shell>
  );
}
