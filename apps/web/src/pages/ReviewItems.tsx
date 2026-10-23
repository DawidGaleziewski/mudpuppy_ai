import { useState } from 'react';
import { Button, Cluster, Field, Input, Note, ScanId, Stack, SubHead, Text, Textarea } from '../design-system';
import { reviewWrites, type DifferenceDetail, type ProposalDetail, type ReanchorDetail } from '../app/api-review';
import type { Ask } from '../app/ConfirmedWrite';
import { ShownStatus } from '../app/ShownStatus';

/** An unexplained difference (read-only): who sees it and who does not, and how a record explains it. */
export function Difference({ d }: { d: DifferenceDetail }) {
  return (
    <Stack>
      {d.element && (
        <Text small block>
          Element <Text mono>{d.element}</Text>
        </Text>
      )}
      {d.sides.map((side) => (
        <Stack key={side.label}>
          <SubHead>{side.label}</SubHead>
          <Stack>
            {side.personas.map((p) => (
              <Cluster key={p.value}>
                <Text mono small>
                  {p.value}
                </Text>
                <Text small muted>
                  {p.label}
                </Text>
              </Cluster>
            ))}
          </Stack>
        </Stack>
      ))}
      {d.compare && <Text href={d.compare.value}>{d.compare.label}</Text>}
      <Text small muted block>
        {d.advice}
      </Text>
    </Stack>
  );
}

/** An amendment that lost its place: why, where it was, then put it back on a screen or dismiss it. */
export function Reanchor({ portal, d, decides, ask }: { portal: string; d: ReanchorDetail; decides: boolean; ask: (a: Ask) => void }) {
  const [state, setState] = useState(d.state_id);
  const [element, setElement] = useState(d.element_key);
  const [text, setText] = useState('');
  const listId = `states-${d.amendment}`;
  return (
    <Stack>
      {d.text && <Note by={`${d.author} · ${d.at}`}>{d.text}</Note>}
      {d.attachment && (
        <Text small block>
          Attachment <Text mono>{d.attachment}</Text>
        </Text>
      )}
      <Text small block>
        {d.why} {d.why_detail && <Text muted>{d.why_detail}</Text>}
      </Text>
      <Cluster>
        <Text small>Was on</Text>
        {d.was_on ? <Text small href={d.was_on.value}>{d.was_on.label}</Text> : <Text small>evidence</Text>}
        {d.element && <Text mono small>{`element ${d.element}`}</Text>}
        {d.changed_by_scan && (
          <>
            <Text small>changed by scan</Text>
            <ScanId id={d.changed_by_scan} href={`/app/scans/${encodeURIComponent(d.changed_by_scan)}`} />
          </>
        )}
      </Cluster>
      {decides && (
        <Stack>
          <Field label="Screen to anchor it on" help="A recorded screen of the portal: pick from the list or paste its id.">
            <Input value={state} list={listId} required autoComplete="off" spellCheck={false} onChange={(e) => setState(e.target.value)} />
          </Field>
          <datalist id={listId}>
            {d.states.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </datalist>
          <Field label="Element key (optional)">
            <Input value={element} autoComplete="off" spellCheck={false} onChange={(e) => setElement(e.target.value)} />
          </Field>
          <Field label="New wording (optional; blank keeps it)">
            <Textarea rows={2} maxLength={50000} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Cluster>
            <Button
              variant="primary"
              disabled={!state.trim()}
              onClick={() =>
                ask({
                  title: `Re-anchor ${d.key}?`,
                  text: `On ${state.trim()}${element.trim() ? `, element ${element.trim()}` : ''}. ${text.trim() ? 'With the new wording.' : 'The wording stays.'} It becomes a new revision.`,
                  confirm: 'Re-anchor here',
                  write: reviewWrites.reanchor(portal, d.amendment, state.trim(), element.trim(), text.trim()),
                })
              }
            >
              Re-anchor here
            </Button>
            <Button
              size="md"
              variant="quiet"
              onClick={() =>
                ask({
                  title: `Dismiss ${d.key}?`,
                  text: 'It leaves the review list. Nothing is deleted.',
                  confirm: 'Dismiss',
                  write: reviewWrites.dismiss(portal, d.amendment),
                })
              }
            >
              Dismiss
            </Button>
          </Cluster>
        </Stack>
      )}
    </Stack>
  );
}

function BeforeAfter({ label, change, mono }: { label: string; change: { before: string | null; after: string }; mono?: boolean }) {
  return (
    <Cluster>
      <Text small muted>
        {label}
      </Text>
      {change.before && change.before !== change.after && (
        <>
          <Text removed mono={mono === true}>
            {change.before}
          </Text>
          <Text small>→</Text>
        </>
      )}
      <Text drawn mono={mono === true}>
        {change.after}
      </Text>
    </Cluster>
  );
}

/** What the assistant proposes: its change before → after, then Apply or Discard (a stale one: Discard only). */
export function Proposal({ portal, d, decides, ask }: { portal: string; d: ProposalDetail; decides: boolean; ask: (a: Ask) => void }) {
  const what = d.is_new ? 'Proposed amendment' : 'Proposed change';
  return (
    <Stack>
      <Cluster>
        <Text small strong>
          {what}
        </Text>
        {!d.is_new && d.base_rev !== null && <Text mono small muted>{`r${String(d.base_rev)} → r${String(d.next_rev)}`}</Text>}
        <ShownStatus status={d.status} />
      </Cluster>
      {d.target && <BeforeAfter label={d.is_new ? 'on' : 'target'} change={d.target} mono />}
      {d.text ? <BeforeAfter label="text" change={d.text} /> : !d.is_new && <Text small muted>text unchanged</Text>}
      {d.stale && (
        <Text small muted block>
          {`${d.key ?? 'The amendment'} is at r${String(d.head_rev)} now; this was proposed on r${String(d.base_rev)}. Nothing was overwritten. Ask again for a new proposal.`}
        </Text>
      )}
      {d.screen && <Text href={`/states/${encodeURIComponent(d.screen)}`}>Show on the screen</Text>}
      {decides && (
        <Cluster>
          <Button
            variant="strong"
            size="md"
            disabled={d.stale}
            onClick={() =>
              ask({
                title: `Apply as r${String(d.next_rev)}?`,
                text: d.is_new ? 'A new amendment is made from it.' : `${d.key ?? 'The amendment'} gets a new revision; r${String(d.base_rev)} stays in its history.`,
                confirm: 'Apply',
                write: reviewWrites.proposal(portal, d.id, 'apply'),
              })
            }
          >
            {`Apply as r${String(d.next_rev)}`}
          </Button>
          <Button
            size="md"
            variant="quiet"
            onClick={() =>
              ask({ title: 'Discard the proposal?', text: 'Nothing changes; it leaves Review.', confirm: 'Discard', write: reviewWrites.proposal(portal, d.id, 'discard') })
            }
          >
            Discard
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}
