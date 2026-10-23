import { useState } from 'react';
import { useParams } from 'react-router';
import { Button, Callout, Cluster, Grid, Input, Note, PageHead, Plate, Select, Stack, Table, Tag, Text, Timeline, TimelineItem } from '../design-system';
import { processesKey, processHref } from '../app/api-processes';
import { processPageHref, useHistory, type History, type Revision } from '../app/api-process-compare';
import { writes } from '../app/api-write';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { plural } from '../app/plural';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

type LiveRow = History['live'][number];

/** Mark a model live in one environment: which model, why. */
function MarkLive({ h, row, ask }: { h: History; row: LiveRow; ask: (a: Ask) => void }) {
  const [label, setLabel] = useState(h.head.models.at(-1)?.value ?? 'A');
  const [reason, setReason] = useState('');
  return (
    <Cluster>
      <Select aria-label={`Process model to mark live in ${row.environment}`} value={label} onChange={(e) => setLabel(e.target.value)}>
        {h.head.models.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
      <Input aria-label="Reason (optional)" placeholder="Reason (optional)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      <Button
        size="sm"
        onClick={() =>
          ask({
            title: `Mark ${label} live in ${row.environment}?`,
            text: 'This records which revision runs there. It deploys nothing; the newest mark wins and earlier ones stay in the record.',
            confirm: `Mark live in ${row.environment}`,
            write: writes.markLive(h.head.portal, h.head.id, row.environment, label, reason.trim()),
          })
        }
      >
        {`Mark live in ${row.environment}`}
      </Button>
    </Cluster>
  );
}

function liveColumns(h: History, ask: (a: Ask) => void) {
  return [
    { header: 'Environment', rowHeader: true, cell: (r: LiveRow) => r.environment },
    {
      header: 'Live now',
      cell: (r: LiveRow) => (
        <Cluster>
          <ShownStatus status={r.status} />
          {r.live && <Tag size="sm">{r.live}</Tag>}
        </Cluster>
      ),
    },
    {
      header: 'How we know',
      cell: (r: LiveRow) =>
        r.how ? (
          <Stack>
            <Text small>{r.how}</Text>
            {r.reason && <Note size="sm">{r.reason}</Note>}
          </Stack>
        ) : (
          <Text muted>Nothing marked yet</Text>
        ),
    },
    { header: 'Mark live', cell: (r: LiveRow) => <MarkLive h={h} row={r} ask={ask} /> },
  ];
}

function RevisionItem({ h, r, ask }: { h: History; r: Revision; ask: (a: Ask) => void }) {
  const model = h.models.find((m) => m.label === r.label);
  const next = (model?.rev ?? r.rev) + 1;
  return (
    <TimelineItem
      head={
        <Cluster>
          <Tag size="sm">{`${r.label} r${String(r.rev)}`}</Tag>
          {r.live && <Text small>{`Live · ${r.live}`}</Text>}
          <Text small muted={!r.latest}>
            {r.latest ? 'Latest' : 'superseded'}
          </Text>
        </Cluster>
      }
    >
      <Stack>
        <Text small>{`${r.change}${r.origin ? ` ${r.origin}` : ''} · ${r.author} · ${r.at}`}</Text>
        {/* a person writes the note of a save or restore; other notes are the machine's */}
        {r.note &&
          (r.change === 'save' || r.change === 'restore' ? (
            <Note size="sm">{r.note}</Note>
          ) : (
            <Text small>{r.note}</Text>
          ))}
        <Cluster>
          <Text small href={processHref(h.head.portal, h.head.key, r.label)}>
            View
          </Text>
          {model?.kind === 'to-be' && (
            <Text small href={processPageHref(h.head.portal, h.head.key, 'compare', `?left=A&right=${r.label}`)}>
              Compare with A
            </Text>
          )}
          {r.restorable && (
            <Button
              size="sm"
              onClick={() =>
                ask({
                  title: `Restore ${r.label} r${String(r.rev)} as ${r.label} r${String(next)}?`,
                  text: 'Restoring adds a new revision with these steps; nothing is deleted.',
                  confirm: `Restore as r${String(next)}`,
                  write: writes.draft(h.head.portal, h.head.id, r.label, 'restore', { rev: r.rev, base_rev: model?.rev ?? r.rev }),
                })
              }
            >
              {`Restore as r${String(next)}`}
            </Button>
          )}
        </Cluster>
      </Stack>
    </TimelineItem>
  );
}

function Body({ h }: { h: History }) {
  const { ask, view } = useConfirmedWrite(processesKey(h.head.portal));
  return (
    <Stack>
      {view}
      {h.conflicts.map((label) => (
        <Callout key={label} tone="failure" title="Someone saved first">
          {`${label} was saved while your draft was based on an older revision. Your draft is kept; nothing was overwritten. `}
          <Text href={processHref(h.head.portal, h.head.key, label)}>Open it to compare or rebase</Text>
        </Callout>
      ))}
      <Plate title="Which process model runs where" flush>
        <Table caption="Which process model runs where" columns={liveColumns(h, ask)} rows={h.live} rowKey={(r) => r.environment} flush />
      </Plate>
      <Text small muted block>
        Restoring adds a new revision. A rescan adds revisions to A and never edits a to-be model.
      </Text>
      <Grid min="360px">
        {h.models.map((m) => (
          <Plate
            key={m.label}
            title={`${m.label} · ${m.kind === 'to-be' ? 'To-be' : 'As-is'}`}
            {...(m.kind === 'to-be' ? { variant: 'drawn' as const } : {})}
            actions={<Text small muted>{plural(m.revisions.length, 'revision')}</Text>}
          >
            <Timeline label={`Revisions of ${m.label}`}>
              {m.revisions.map((r) => (
                <RevisionItem key={r.rev} h={h} r={r} ask={ask} />
              ))}
            </Timeline>
          </Plate>
        ))}
      </Grid>
      <Grid min="360px">
        <Plate title="The process itself" actions={<Text small muted>{plural(h.process.length, 'revision')}</Text>}>
          <Timeline label="Revisions of the process">
            {h.process.map((r) => (
              <TimelineItem key={r.rev} head={<Tag size="sm">{`r${String(r.rev)}`}</Tag>}>
                <Cluster>
                  <Text small>{r.change}</Text>
                  <Text small asIs>
                    {r.name}
                  </Text>
                  <ShownStatus status={r.stage} />
                  <Text small>{`${r.author} · ${r.at}`}</Text>
                </Cluster>
              </TimelineItem>
            ))}
          </Timeline>
        </Plate>
        <Plate title="Change spec" actions={<Text small muted>{plural(h.specs.length, 'revision')}</Text>}>
          {h.specs.length === 0 ? (
            <Text small muted block>
              No change spec saved yet. Compare generates one; save it there.
            </Text>
          ) : (
            <Timeline label="Revisions of the change spec">
              {h.specs.map((s) => (
                <TimelineItem key={s.rev} head={<Tag size="sm">{`spec r${String(s.rev)}`}</Tag>}>
                  <Stack>
                    <Text small>{`${s.pair} · ${s.author} · ${s.at}`}</Text>
                    <Text small href={processPageHref(h.head.portal, h.head.key, 'compare', `?left=${s.left}&right=${s.right}`)}>
                      Open in Compare
                    </Text>
                  </Stack>
                </TimelineItem>
              ))}
            </Timeline>
          )}
        </Plate>
      </Grid>
    </Stack>
  );
}

/** A process's History (designer screen 07): which model runs where and every revision. */
export function ProcessHistory() {
  const { portal = '', key = '' } = useParams();
  const q = useHistory(portal, key);
  const h = q.data;
  return (
    <Shell current="processes">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          { label: 'Processes', href: `/app/portals/${encodeURIComponent(portal)}/processes` },
          { label: h?.head.name ?? key, href: processHref(portal, key) },
          { label: 'History' },
        ]}
        title="History"
        meta={
          h
            ? `${h.head.name} · ${plural(h.head.models.length, 'process model')} · ${plural(h.revision_count, 'revision')} · ${h.marked_in.length ? `live in ${h.marked_in.join(', ')}` : 'not marked live anywhere'}`
            : undefined
        }
      />
      <QueryState query={q} what="the history">
        {(d) => <Body h={d} />}
      </QueryState>
    </Shell>
  );
}
