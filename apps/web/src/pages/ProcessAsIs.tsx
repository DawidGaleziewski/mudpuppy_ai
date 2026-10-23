import { useState } from 'react';
import { Button, Callout, Cluster, Field, Plate, Select, Stack, Text } from '../design-system';
import type { AsIsDoc, ProcessPage } from '../app/api-process';
import { writes } from '../app/api-write';
import type { Ask } from '../app/ConfirmedWrite';
import { plural } from '../app/plural';
import { ShownStatus } from '../app/ShownStatus';

/** Spec 027 US2–US3: what the as-is still lacks, its sign-off, and the stage moves. */
export function AsIsDocumentation({ d, a, ask }: { d: ProcessPage; a: AsIsDoc; ask: (x: Ask) => void }) {
  const [stage, setStage] = useState(d.stage_value);
  const open = a.questions + a.unconfirmed + a.reanchor;
  const so = a.sign_off;
  const writable = !d.archived_at;
  return (
    <Plate title="As-is documentation" actions={<ShownStatus status={d.stage} />}>
      <Stack>
        <Text small block>
          {open
            ? `Still open on these screens: ${plural(a.questions, 'open question')} · ${plural(a.unconfirmed, 'record')} to confirm · ${plural(a.reanchor, 'amendment')} to re-anchor.`
            : 'Nothing open on these screens: no open questions, no records to confirm, no amendments to re-anchor.'}{' '}
          <Text href="/review">Review</Text>
        </Text>
        {so && (
          <Text small block>
            {`Signed off as documented by ${so.by} · `}
            <Text mono small>
              {so.at}
            </Text>
            {so.signed_rev !== null ? ` · covering A r${String(so.signed_rev)}` : ''}
          </Text>
        )}
        {so?.changed && (
          <Callout tone="intent" title="As-is changed since documented">
            {`A r${String(so.signed_rev)} → r${String(so.head_rev)}: a rescan or an edit changed the screens after the sign-off. See what changed in History, then sign off again.`}
          </Callout>
        )}
        {writable && (
          <Cluster>
            {a.sign_off_action && (
              <Button
                variant={d.model.kind === 'as-is' ? 'primary' : 'strong'}
                onClick={() =>
                  ask({
                    title: `${a.sign_off_action ?? ''}?`,
                    text: `${d.name} moves to As-is documented, signed with your name; the sign-off covers A as it is now.`,
                    confirm: a.sign_off_action ?? 'Sign off',
                    write: writes.stage(d.portal, d.id, 'as_is_documented', d.rev),
                  })
                }
              >
                {a.sign_off_action}
              </Button>
            )}
            <Field label="Stage">
              <Select value={stage} onChange={(e) => setStage(e.target.value)}>
                {a.stages.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              disabled={stage === d.stage_value}
              onClick={() =>
                ask({
                  title: `Move ${d.name} to ${a.stages.find((o) => o.value === stage)?.label ?? stage}?`,
                  text: 'Every move is signed and shows in History; a process can move back at any time.',
                  confirm: 'Set stage',
                  write: writes.stage(d.portal, d.id, stage, d.rev),
                })
              }
            >
              Set stage
            </Button>
          </Cluster>
        )}
      </Stack>
    </Plate>
  );
}
