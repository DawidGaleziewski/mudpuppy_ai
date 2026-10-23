import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button, Callout, Cluster, Columns, Facts, Field, LinkButton, PageHead, Plate, Stack, SubHead, Tag, Text, Textarea } from '../design-system';
import { docKey, docWrites, useDocRecord, type DocRecordPage } from '../app/api-doc';
import { docsHref } from '../app/api-docs';
import { reviewWrites } from '../app/api-review';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';
import { Content, Evidence, Figures, History, Relations, ReviewNotes, VariantMaps } from './DocContent';

/** The record's status line and facts. */
function Header({ d }: { d: DocRecordPage }) {
  return (
    <Plate
      title="Record"
      actions={
        <Cluster>
          <ShownStatus status={d.status} />
          <ShownStatus status={d.confidence} />
          {d.not_observable && <ShownStatus status={d.not_observable} />}
          {d.followup && <ShownStatus status={d.followup} />}
        </Cluster>
      }
    >
      <Stack>
        {d.blocked_reason && <Callout>{d.blocked_reason}</Callout>}
        {!d.is_latest && (
          <Callout tone="intent">
            {`Showing revision ${String(d.rev)} of ${String(d.latest_rev)}, an older revision. `}
            <Text href={`/app/portals/${encodeURIComponent(d.portal)}/docs/${encodeURIComponent(d.key)}`}>View the latest</Text>
          </Callout>
        )}
        <Facts
          items={[
            ['Id', <Tag key="id" size="sm">{d.key}</Tag>],
            ['Kind', d.kind],
            ['Revision', `${String(d.rev)} of ${String(d.latest_rev)}${d.confirmed_rev ? ` · confirmed at rev ${String(d.confirmed_rev)}` : ''}`],
            ['Change', d.change],
            ['Analysis session', <Tag key="s" size="sm" href={d.session.href} {...(d.session.title ? { title: d.session.title } : {})}>{d.session.label}</Tag>],
            ['Written (UTC)', <Text key="w" mono small>{d.written_at}</Text>],
          ]}
        />
        {d.change_note && <Text small muted>{`Change note: ${d.change_note}`}</Text>}
      </Stack>
    </Plate>
  );
}

type Action = 'confirm' | 'reject' | 'comment';

/** Review (FR-037..039): confirm, reject with a reason, comment; each asks first. */
function ReviewPanel({ d, ask }: { d: DocRecordPage; ask: (a: Ask) => void }) {
  const p = d.panel;
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const decideOff = !p.enabled || !p.can_decide;
  const send = (action: Action, text: string) =>
    ask({
      title: `${{ confirm: 'Confirm', reject: 'Reject', comment: 'Comment on' }[action]} ${d.key} revision ${String(p.rev)}?`,
      text: text || 'The revision is confirmed as it stands, with your name.',
      confirm: { confirm: 'Confirm', reject: 'Reject', comment: 'Comment' }[action],
      write: reviewWrites.record(d.portal, d.key, p.rev, action, text),
    });
  return (
    <Plate title="Review" actions={<Tag size="sm">{`rev ${String(p.rev)}`}</Tag>}>
      <Stack>
        {!p.enabled && (
          <Callout>
            Review actions are off: no reviewer is set. Start the dashboard with <Text mono>MUDPUPPY_REVIEWER</Text> set to your name (it is stored with every review).
          </Callout>
        )}
        <Text small muted>
          {`Reviews apply to the latest revision, ${String(p.rev)} (${p.status}).${p.viewing_latest ? '' : ' You are looking at an older revision.'}${p.can_decide ? '' : ' Only a draft can be confirmed or rejected; a comment is always possible.'}`}
        </Text>
        <Cluster>
          <Button variant="primary" disabled={decideOff} onClick={() => send('confirm', '')}>
            {`Confirm rev ${String(p.rev)}`}
          </Button>
        </Cluster>
        <Field label="Reason (required to reject)">
          <Textarea rows={2} value={reason} disabled={decideOff} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Cluster>
          <Button size="md" disabled={decideOff || !reason.trim()} onClick={() => send('reject', reason.trim())}>
            {`Reject rev ${String(p.rev)}`}
          </Button>
        </Cluster>
        <Field label="Comment (required)">
          <Textarea rows={2} value={comment} disabled={!p.enabled} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <Cluster>
          <Button size="md" variant="quiet" disabled={!p.enabled || !comment.trim()} onClick={() => send('comment', comment.trim())}>
            Comment
          </Button>
        </Cluster>
        <SubHead>{`Decisions on revision ${String(p.rev)}`}</SubHead>
        {p.reviews.length ? <ReviewNotes reviews={p.reviews} /> : <Text small muted>No review yet. Confirm, reject with a reason, or comment; the decision is recorded with your name.</Text>}
      </Stack>
    </Plate>
  );
}

/** A process record: its documentation export, and the workspace process (Open in Processes asks first). */
function ProcessLinks({ d, ask }: { d: DocRecordPage; ask: (a: Ask) => void }) {
  const p = d.process;
  if (!p) return null;
  return (
    <Cluster>
      <Text small href={p.export}>
        Documentation of this process
      </Text>
      <Text small muted>
        steps, requirements, EARS, contracts and gaps, as a folder to download.
      </Text>
      {p.linked && (
        <>
          <Text small>In Processes as</Text>
          <Tag size="sm" href={p.linked.href}>
            {p.linked.label}
          </Tag>
        </>
      )}
      {p.can_open && (
        <Button
          size="md"
          onClick={() =>
            ask({
              title: `Open ${d.key} in Processes?`,
              text: 'A workspace process with these screens in walking order, for sign-off, archive and to-be work.',
              confirm: 'Open in Processes',
              follow: 'Open the process',
              write: docWrites.openProcess(d.portal, d.key),
            })
          }
        >
          Open in Processes
        </Button>
      )}
    </Cluster>
  );
}

function Neighbours({ d }: { d: DocRecordPage }) {
  const nb = d.neighbours;
  if (!nb) return null;
  return (
    <Cluster>
      <Text small muted>
        {`${String(nb.position)} of ${String(nb.total)} in `}
        <Text href={nb.list}>{nb.label}</Text>
      </Text>
      {nb.prev && (
        <LinkButton size="md" href={nb.prev}>
          Previous
        </LinkButton>
      )}
      {nb.next && (
        <LinkButton size="md" href={nb.next}>
          Next
        </LinkButton>
      )}
    </Cluster>
  );
}

function Body({ d, ask }: { d: DocRecordPage; ask: (a: Ask) => void }) {
  return (
    <Stack>
      <ProcessLinks d={d} ask={ask} />
      <Columns
        main={
          <Stack>
            <Content d={d} />
            <VariantMaps d={d} />
            <Figures d={d} />
            <Evidence d={d} />
            <Relations d={d} />
            <History d={d} />
          </Stack>
        }
        side={
          <Stack>
            <Header d={d} />
            <ReviewPanel d={d} ask={ask} />
          </Stack>
        }
      />
    </Stack>
  );
}

/** One documentation record (spec 004 R-15): its revision, content, evidence, history and review. */
export function DocRecord() {
  const { portal = '', key = '' } = useParams();
  const [params] = useSearchParams();
  const q = useDocRecord(portal, key, params.get('rev'), params.get('list'));
  const { ask, view } = useConfirmedWrite(docKey(portal));
  const d = q.data;
  const title = d ? (
    <>
      <Text mono>{d.key}</Text> <Text asIs>{d.title}</Text>
    </>
  ) : (
    key
  );
  return (
    <Shell current="docs" context={d ? { type: 'docs', id: d.id, rev: d.latest_rev, label: d.title, ids: [d.key] } : null}>
      <PageHead crumbs={[{ label: 'Portals', href: '/app/' }, { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` }, { label: 'Docs', href: docsHref(portal) }, { label: key }]} title={title} actions={d && <Neighbours d={d} />} />
      {view}
      <QueryState query={q} what="the record">
        {(page) => <Body d={page} ask={ask} />}
      </QueryState>
    </Shell>
  );
}
