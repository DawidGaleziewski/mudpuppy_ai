import { useState } from 'react';
import { Button, Callout, Cluster, Field, Input, Plate, Split, Stack, SubHead, Table, Text, Textarea } from '../design-system';
import { reviewHref, reviewWrites, undoAsk, type ReviewDetail as Detail, type ReviewPage } from '../app/api-review';
import { sameScreenHref } from '../app/api-same-screen';
import type { Ask } from '../app/ConfirmedWrite';
import { Difference, Proposal, Reanchor } from './ReviewItems';
import { RowFacts } from './ReviewRows';
import { Suite } from './ReviewSuite';

function Off() {
  return (
    <Text small muted block>
      Review actions are off: set <Text mono>MUDPUPPY_REVIEWER</Text> to your name and restart the dashboard.
    </Text>
  );
}

function Also({ portal, d }: { portal: string; d: Detail }) {
  return (
    <Stack>
      <SubHead>{`Also settles · ${String(d.also.length)}`}</SubHead>
      <Table
        caption="Same screen? pairs a confirm also settles"
        columns={[
          { header: 'Linked item · now', cell: (p) => <Text href={sameScreenHref(portal, { a: p.a, b: p.b })}>{`Same screen?${p.conflict ? ' · conflict' : ''} ${p.label}`}</Text>, rowHeader: true },
          { header: 'When you confirm', cell: (p) => `Answered "Same screen" with your reason${p.answered_by ? `, shown next to ${p.answered_by}'s` : ''}.` },
        ]}
        rows={d.also}
        rowKey={(p) => `${p.a}:${p.b}`}
        dense
      />
      <Text small muted>
        Undo takes back the decision; a Same screen? answer stays until you answer the pair again.
      </Text>
    </Stack>
  );
}

function Decide({ portal, d, reasons, ask }: { portal: string; d: Detail; reasons: string[]; ask: (a: Ask) => void }) {
  const [reason, setReason] = useState('');
  const keys = d.row.keys;
  const also = d.also.map((p) => `${p.a}:${p.b}`);
  const decide = (action: 'confirm' | 'reject') =>
    ask({
      title: `${action === 'confirm' ? 'Confirm' : 'Reject'} ${keys.join(', ')}?`,
      text: reason ? `Reason: ${reason}` : 'No reason given: "Confirmed in Review." is recorded.',
      confirm: action === 'confirm' ? 'Confirm' : 'Reject',
      write: reviewWrites.decide(portal, keys, action, reason, action === 'confirm' ? also : []),
      undo: undoAsk(portal),
    });
  const listId = `reasons-${d.row.kind}`;
  return (
    <Stack>
      <Field label="Reason · one line" help="Required to reject, optional to confirm. Shown wherever this decision appears.">
        <Input data-review-key="r" value={reason} maxLength={200} placeholder="Why?" list={listId} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <datalist id={listId}>
        {reasons.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
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

function QueueDetail({ page, d, ask }: { page: ReviewPage; d: Detail; ask: (a: Ask) => void }) {
  const decidable = d.row.keys.length > 0;
  return (
    <Stack>
      {d.text && <Text small block>{d.text}</Text>}
      <Text small muted block>
        {[d.row.hint, d.row.at].filter(Boolean).join(' · ')}
      </Text>
      {d.link && <Text href={d.link.value}>{d.link.label}</Text>}
      {d.also.length > 0 && <Also portal={page.portal} d={d} />}
      {decidable && (page.decides ? <Decide portal={page.portal} d={d} reasons={page.reasons[d.row.kind] ?? []} ask={ask} /> : <Off />)}
      {!decidable && d.row.kind === 'findings' && (
        <Text small muted block>
          No explanation to decide yet. The agent proposes one with a test, or a check run decides it.
        </Text>
      )}
    </Stack>
  );
}

type RecordAction = 'confirm' | 'reject' | 'comment';

/** How each record review is asked: the question's verb and the confirming word. */
const RECORD_ASK: Record<RecordAction, { verb: string; confirm: string }> = {
  confirm: { verb: 'Confirm', confirm: 'Confirm' },
  reject: { verb: 'Reject', confirm: 'Reject' },
  comment: { verb: 'Comment on', confirm: 'Comment' },
};

function RecordDecide({ portal, d, ask }: { portal: string; d: Detail; ask: (a: Ask) => void }) {
  const [reject, setReject] = useState('');
  const [comment, setComment] = useState('');
  const rev = d.rev ?? 1;
  const key = d.row.id;
  const send = (action: RecordAction, text: string) =>
    ask({
      title: `${RECORD_ASK[action].verb} ${key} revision ${String(rev)}?`,
      text: text || 'The revision is confirmed as it stands.',
      confirm: RECORD_ASK[action].confirm,
      write: reviewWrites.record(portal, key, rev, action, text),
    });
  return (
    <Stack>
      <Cluster>
        <Button data-review-key="c" variant="primary" onClick={() => send('confirm', '')}>{`Confirm rev ${String(rev)}`}</Button>
      </Cluster>
      <Field label="Reason (required to reject)">
        <Textarea data-review-key="r" rows={2} value={reject} onChange={(e) => setReject(e.target.value)} />
      </Field>
      <Cluster>
        <Button size="md" disabled={!reject.trim()} onClick={() => send('reject', reject.trim())}>{`Reject rev ${String(rev)}`}</Button>
      </Cluster>
      <Field label="Comment">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <Cluster>
        <Button size="md" variant="quiet" disabled={!comment.trim()} onClick={() => send('comment', comment.trim())}>
          Comment
        </Button>
      </Cluster>
    </Stack>
  );
}

function RecordDetail({ page, d, ask }: { page: ReviewPage; d: Detail; ask: (a: Ask) => void }) {
  return (
    <Stack>
      <Text mono small muted>{`revision ${String(d.rev)} of ${String(d.revs)}`}</Text>
      <SubHead>Screens it cites</SubHead>
      {d.cited.length ? (
        <Stack>
          {d.cited.map((s) => (
            <Stack key={s.state}>
              <Text href={`/app/states/${encodeURIComponent(s.state)}`}>{s.title}</Text>
              <Text route>{s.route}</Text>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Text small muted>
          No screens cited; the record rests on other evidence.
        </Text>
      )}
      {d.link && <Text href={d.link.value}>{d.link.label}</Text>}
      {page.decides ? <RecordDecide portal={page.portal} d={d} ask={ask} /> : <Off />}
    </Stack>
  );
}

function Neighbours({ page }: { page: ReviewPage }) {
  const nb = page.neighbours;
  if (!nb) return null;
  const href = (select: string) => reviewHref(page.portal, { show: page.show ?? undefined, select });
  return (
    <Split>
      <Text small muted>{`${String(nb.index)} of ${String(nb.total)} · ${nb.label}`}</Text>
      <Cluster>
        {nb.prev ? <Text href={href(nb.prev)}>Previous</Text> : <Text muted>Previous</Text>}
        {nb.next ? <Text href={href(nb.next)}>Next</Text> : <Text muted>Next</Text>}
      </Cluster>
    </Split>
  );
}

/** The selected item beside the inbox: its facts, its way on and its decision. */
export function ReviewDetail({ page, ask }: { page: ReviewPage; ask: (a: Ask) => void }) {
  const d = page.selected;
  if (!d) {
    return <Callout>Nothing waits for you. Decisions land here as scans, the BA agent and the assistant work.</Callout>;
  }
  return (
    <Stack>
      <Neighbours page={page} />
      {/* a suite is the BA's proposal until approved: drawn (rule 3) */}
      <Plate title={<Text asIs>{d.row.title}</Text>} {...(d.suite ? { variant: 'drawn' as const } : {})}>
        <Stack>
          <RowFacts row={d.row} />
          <Body page={page} d={d} ask={ask} />
        </Stack>
      </Plate>
    </Stack>
  );
}

/** The selected item's own part, by its kind; an edit conflict has none beyond its row. */
function Body({ page, d, ask }: { page: ReviewPage; d: Detail; ask: (a: Ask) => void }) {
  const writes = { portal: page.portal, decides: page.decides, ask };
  if (!d.has_detail) return <Callout>Nothing more is recorded for this item.</Callout>;
  if (d.difference) return <Difference d={d.difference} />;
  const own = ownPart(d, writes);
  if (own) return page.decides ? own : <Stack>{own}<Off /></Stack>;
  const record = d.row.kind === 'records' || d.row.kind === 'assumptions';
  return record ? <RecordDetail page={page} d={d} ask={ask} /> : <QueueDetail page={page} d={d} ask={ask} />;
}

/** A re-anchor, a proposal or a suite with its form; none for the other kinds. */
function ownPart(d: Detail, writes: { portal: string; decides: boolean; ask: (a: Ask) => void }) {
  if (d.reanchor) return <Reanchor d={d.reanchor} {...writes} />;
  if (d.proposal) return <Proposal d={d.proposal} {...writes} />;
  if (d.suite) return <Suite d={d.suite} {...writes} />;
  return null;
}
