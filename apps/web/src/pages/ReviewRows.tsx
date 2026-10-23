import { useState, type ReactNode } from 'react';
import { Button, Check, Cluster, Count, Field, Input, Plate, Row, Rows, Stack, Tag, Text } from '../design-system';
import { reviewHref, reviewWrites, undoAsk, type ReviewGroup, type ReviewPage, type ReviewRow } from '../app/api-review';
import type { Ask } from '../app/ConfirmedWrite';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';

/** A row's marks: its ids, the chip, the status and where it is. */
export function RowFacts({ row }: { row: ReviewRow }) {
  const tags = row.tags.length ? row.tags : row.keys;
  return (
    <Cluster>
      {tags.map((t) => (
        <Tag key={t} size="sm">
          {t}
        </Tag>
      ))}
      {row.chip && <ShownChip chip={row.chip} />}
      {row.status && <ShownStatus status={row.status} />}
      {row.meta && (
        <Text small muted asIs>
          {row.meta}
        </Text>
      )}
    </Cluster>
  );
}

/** One decision for several items (an alike set or the person's selection), with one reason. */
function Bulk({ portal, label, keys, verb, ask }: { portal: string; label: string; keys: string[]; verb: string; ask: (a: Ask) => void }) {
  const [reason, setReason] = useState('');
  const decide = (action: 'confirm' | 'reject') =>
    ask({
      title: `${action === 'confirm' ? 'Confirm' : 'Reject'} ${String(keys.length)}: ${label}?`,
      text: `${keys.join(', ')}. ${reason ? `Reason: ${reason}` : 'No reason given.'} One Undo takes them all back.`,
      confirm: action === 'confirm' ? 'Confirm' : 'Reject',
      write: reviewWrites.decide(portal, keys, action, reason),
      undo: undoAsk(portal),
    });
  return (
    <Cluster>
      <Text small asIs>
        {label}
      </Text>
      <Field label={`Reason for ${verb}`}>
        <Input value={reason} maxLength={200} placeholder="One reason for all" onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button size="sm" variant="strong" disabled={keys.length === 0} onClick={() => decide('confirm')}>
        {`Confirm ${verb}`}
      </Button>
      <Button size="sm" disabled={keys.length === 0 || !reason.trim()} onClick={() => decide('reject')}>
        {`Reject ${verb}`}
      </Button>
    </Cluster>
  );
}

interface GroupProps {
  page: ReviewPage;
  group: ReviewGroup;
  intent: boolean;
  ask: (a: Ask) => void;
}

function GroupRows({ page, group, picked, pick }: { page: ReviewPage; group: ReviewGroup; picked: string[]; pick?: (row: ReviewRow, on: boolean) => void }) {
  const selected = page.selected?.row;
  return (
    <Rows label={group.label}>
      {group.rows.map((row) => (
        <Row
          key={row.id}
          current={selected?.kind === row.kind && selected.id === row.id}
          aside={row.at && <Text mono small muted>{row.at}</Text>}
        >
          {pick && row.keys.length > 0 && (
            <Check
              label={<Text small muted>Select</Text>}
              checked={row.keys.every((k) => picked.includes(k))}
              onChange={(e) => pick(row, e.target.checked)}
            />
          )}
          <RowFacts row={row} />
          <Text href={reviewHref(page.portal, { show: page.show ?? undefined, select: `${row.kind}:${row.id}` })}>{row.title}</Text>
          {row.route && <Text route>{row.route}</Text>}
          {row.hint && (
            <Text small muted asIs>
              {row.hint}
            </Text>
          )}
        </Row>
      ))}
    </Rows>
  );
}

/** "Show all" on All, the pages on a group's own tab; nothing otherwise. */
function groupFoot(page: ReviewPage, group: ReviewGroup): ReactNode {
  const at = (n: number) => reviewHref(page.portal, { show: group.kind, page: n });
  if (!page.show && group.count > group.rows.length) {
    return <Text href={reviewHref(page.portal, { show: group.kind })}>{`Show all ${String(group.count)}`}</Text>;
  }
  if (page.show && group.pages > 1) {
    return (
      <Cluster>
        {group.page > 1 ? <Text href={at(group.page - 1)}>Previous</Text> : <Text muted>Previous</Text>}
        <Text small muted>{`Page ${String(group.page)} of ${String(group.pages)}`}</Text>
        {group.page < group.pages ? <Text href={at(group.page + 1)}>Next</Text> : <Text muted>Next</Text>}
      </Cluster>
    );
  }
  return null;
}

/** A group of the inbox: its alike sets and the person's selection decided at once, then its rows. */
export function Group({ page, group, intent, ask }: GroupProps) {
  const [picked, setPicked] = useState<string[]>([]);
  if (group.count === 0) {
    return (
      <Plate title={group.label} actions={<Count muted>0</Count>}>
        <Text muted>{group.empty}</Text>
      </Plate>
    );
  }
  const decides = group.decides;
  const pick = (row: ReviewRow, on: boolean) =>
    setPicked((now) => (on ? [...new Set([...now, ...row.keys])] : now.filter((k) => !row.keys.includes(k))));
  const foot = groupFoot(page, group);
  return (
    <Plate
      title={group.label}
      actions={<Count>{group.count}</Count>}
      {...(intent ? { variant: 'intent' as const } : {})}
      {...(foot ? { foot } : {})}
    >
      <Stack>
        {decides &&
          group.alike.map((a) => (
            <Bulk key={a.keys.join(',')} portal={page.portal} label={`${String(a.count)} alike · ${a.label}`} keys={a.keys} verb={String(a.keys.length)} ask={ask} />
          ))}
        {/* the person's own selection: its bar appears once a row is ticked */}
        {decides && picked.length > 0 && <Bulk portal={page.portal} label={`${String(picked.length)} selected`} keys={picked} verb="selected" ask={ask} />}
        <GroupRows page={page} group={group} picked={picked} {...(decides ? { pick } : {})} />
      </Stack>
    </Plate>
  );
}
