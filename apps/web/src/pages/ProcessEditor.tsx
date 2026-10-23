import { Button, Callout, Cluster, LinkButton, Plate, Stack, Tag, Text } from '../design-system';
import type { ProcessPage } from '../app/api-process';
import { htmxProcessHref } from '../app/api-processes';
import { writes } from '../app/api-write';
import type { Ask } from '../app/ConfirmedWrite';
import { ShownStatus } from '../app/ShownStatus';

interface BarProps {
  d: ProcessPage;
  ask: (a: Ask) => void;
}

/** Someone saved the model after the person's draft began: compare, or rebase the draft. */
function Conflict({ d, ask, base }: BarProps & { base: number }) {
  const { label, rev } = d.model;
  return (
    <Callout tone="failure" title="Someone saved first">
      {`${label} r${String(rev)} was saved while your draft was based on ${label} r${String(base)}. Your draft is kept; nothing was overwritten.`}
      <Cluster>
        <LinkButton size="md" href={htmxProcessHref(d.key, 'compare', `?left=${label}&right=${label}`)}>{`Compare your draft with r${String(rev)}`}</LinkButton>
        <Button
          size="md"
          variant="strong"
          onClick={() =>
            ask({
              title: `Rebase your draft onto ${label} r${String(rev)}?`,
              text: 'Your draft keeps its steps and now sits on the latest revision; nothing is lost.',
              confirm: 'Rebase',
              write: writes.draft(d.portal, d.id, label, 'rebase'),
            })
          }
        >
          {`Rebase your draft onto r${String(rev)}`}
        </Button>
      </Cluster>
    </Callout>
  );
}

/** The person's open draft: how far it is from the head, Discard and Save. */
function OpenDraft({ d, ask, pending, at }: BarProps & { pending: number; at: string }) {
  const { label, rev } = d.model;
  const next = `${label} r${String(rev + 1)}`;
  return (
    <Plate variant="drawn" label="Your draft">
      <Cluster>
        {d.model.draft && <ShownStatus status={d.model.draft} />}
        <Text small>of</Text>
        <Tag size="sm">{next}</Tag>
        <Text small>{`· ${String(pending)} change${pending === 1 ? '' : 's'} since`}</Text>
        <Tag size="sm">{`${label} r${String(rev)}`}</Tag>
        <Text small>
          · autosaved <Text mono small>{at}</Text> · only you see this draft
        </Text>
        <Button
          size="md"
          variant="quiet"
          onClick={() =>
            ask({
              title: 'Discard your draft?',
              text: `${label} r${String(rev)} stays as it is.`,
              confirm: 'Discard draft',
              write: writes.draft(d.portal, d.id, label, 'discard'),
            })
          }
        >
          Discard draft
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            ask({
              title: `Save as ${next}?`,
              text: `Your draft becomes ${next}, signed with your name; everyone sees it and History keeps every revision.`,
              confirm: `Save as ${next}`,
              write: writes.draft(d.portal, d.id, label, 'save', { base_rev: rev }),
            })
          }
        >
          {`Save as ${next}`}
        </Button>
      </Cluster>
    </Plate>
  );
}

/**
 * Above a to-be model's steps (screen 05): the person's draft and its Save and Discard, or that
 * someone saved first (Compare, Rebase), or how a first edit starts a draft; why it cannot be
 * drawn when no reviewer is named. A failed autosave says so here.
 */
export function DraftBar({ d, ask, failed }: BarProps & { failed: string | null }) {
  const ed = d.editor;
  if (!ed) return null;
  if (!ed.editable)
    return <Callout>Drawing is off: set MUDPUPPY_REVIEWER to your name and restart the dashboard. Every revision is signed.</Callout>;
  const draft = ed.draft;
  let bar = (
    <Text small muted block>
      {`No draft open. Edit a step to start one; it is saved as you go and only you see it until you save ${d.model.label} r${String(d.model.rev + 1)}.`}
    </Text>
  );
  if (draft?.conflict) bar = <Conflict d={d} ask={ask} base={draft.base_rev} />;
  else if (draft) bar = <OpenDraft d={d} ask={ask} pending={draft.pending} at={draft.updated_at} />;
  return (
    <Stack>
      {failed && (
        <Callout tone="failure" live>
          {failed}
        </Callout>
      )}
      {bar}
    </Stack>
  );
}
