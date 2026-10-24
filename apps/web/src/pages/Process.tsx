import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button, Callout, Cluster, Columns, LinkButton, PageHead, Segmented, Stack, Tag, Text } from '../design-system';
import { docHref, useProcessPage, type ProcessPage } from '../app/api-process';
import { exportHref, processesKey, useProcesses } from '../app/api-processes';
import { MergeDialog } from '../app/MergeDialog';
import { MergeDone } from '../app/MergeDone';
import type { WriteResult } from '../app/state/http';
import { ProcessScope } from './ProcessScope';
import { processPageHref } from '../app/api-process-compare';
import { writes } from '../app/api-write';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { headMeta, QueryState } from '../app/QueryState';
import { useGo } from '../app/RouterAnchor';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';
import { useDraft } from '../app/useDraft';
import { AsIsDocumentation } from './ProcessAsIs';
import { DraftBar } from './ProcessEditor';
import { ProcessFacts } from './ProcessFacts';
import { AsIsReference, ProcessSteps } from './ProcessSteps';
import { SelectedStep } from './SelectedStep';

function Meta({ d }: { d: ProcessPage }) {
  return (
    <Cluster>
      <Tag size="sm">{d.key}</Tag>
      <ShownStatus status={d.stage} />
      <Text small>
        persona <Text mono>{d.persona}</Text>
      </Text>
      {d.live.map((l) => (
        <Text key={l.environment} small>
          {`Live in ${l.environment}: `}
          <Tag size="sm">{l.what}</Tag>
        </Text>
      ))}
      <Text small>{`${String(d.screens)} screens`}</Text>
      {d.record_key && (
        <Text small>
          documented as{' '}
          <Tag size="sm" href={docHref(d.portal, d.record_key)}>
            {d.record_key}
          </Tag>
        </Text>
      )}
    </Cluster>
  );
}

function Actions({ d, ask, merge }: { d: ProcessPage; ask: (a: Ask) => void; merge: () => void }) {
  const right = d.model.kind === 'to-be' ? d.model.label : d.to_be_first;
  return (
    <Cluster>
      {right && <LinkButton href={processPageHref(d.portal, d.key, 'compare', `?left=A&right=${right}`)}>{`Compare A and ${right}`}</LinkButton>}
      <LinkButton href={processPageHref(d.portal, d.key, 'history')}>History</LinkButton>
      <LinkButton href={exportHref(d.portal, d.key)}>Documentation</LinkButton>
      {!d.archived_at && <Button onClick={merge}>Merge with…</Button>}
      {!d.archived_at && (
        <Button
          variant="quiet"
          onClick={() =>
            ask({
              title: `Archive ${d.name}?`,
              text: 'It leaves the list and its screens count as in no process again. Every revision, draft and spec is kept; Restore puts it back.',
              confirm: 'Archive',
              write: writes.archive(d.portal, d.id, d.rev),
            })
          }
        >
          Archive
        </Button>
      )}
    </Cluster>
  );
}

/** Merge with… (designer T-06): the dialog over this process and another of the portal's, then its answer with Undo. */
function useMergeWith(d: ProcessPage) {
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState<WriteResult | null>(null);
  const targets = useProcesses(d.portal, false, 1, shown).data?.targets ?? [];
  const self = targets.find((t) => t.id === d.id) ?? { id: d.id, key: d.key, name: d.name, persona: d.persona, steps: d.screens, states: [] };
  const titles = new Map(d.steps.map((s) => [s.state ?? '', s.title]));
  const view = (ask: (a: Ask) => void) => (
    <>
      {done && <MergeDone portal={d.portal} result={done} ask={ask} />}
      {shown && (
        <MergeDialog
          portal={d.portal}
          first={self}
          candidates={targets}
          onClose={() => setShown(false)}
          onDone={(r) => {
            setShown(false);
            setDone(r);
          }}
          titleOf={(s) => titles.get(s) ?? s}
        />
      )}
    </>
  );
  return { open: () => setShown(true), view };
}

function ModelSwitch({ d, ask, setModel }: { d: ProcessPage; ask: (a: Ask) => void; setModel: (m: string) => void }) {
  const from = d.model;
  const go = useGo();
  return (
    <Cluster>
      <Segmented
        label="Process model"
        selected={d.model.label}
        onSelect={setModel}
        items={d.models.map((m) => ({
          value: m.label,
          label: `${m.label} · ${m.kind === 'as-is' ? 'As-is' : 'To-be'} r${String(m.rev)}${m.draft ? ' · draft open' : ''}`,
        }))}
      />
      {!d.archived_at && (
        <Button
          size="md"
          variant="quiet"
          onClick={() =>
            ask({
              title: d.to_be_first ? `A new process model from ${from.label} r${String(from.rev)}?` : 'Start a to-be design?',
              text: `A new to-be model starts as a copy of ${from.label} r${String(from.rev)}; you draw it in your own draft.`,
              confirm: d.to_be_first ? 'Make the model' : 'Start the design',
              write: writes.newModel(d.portal, d.id, from.label),
              follow: 'Open the new model',
              onDone: (r) => {
                if (r.href) go(r.href);
              },
            })
          }
        >
          {d.to_be_first ? `+ Process model from ${from.label} r${String(from.rev)}` : 'Start a to-be design'}
        </Button>
      )}
    </Cluster>
  );
}

function Body({ d, setView }: { d: ProcessPage; setView: (next: { model?: string; step?: string }) => void }) {
  // the process's own query sits under the list's key: one refresh covers both
  const { ask, view } = useConfirmedWrite(processesKey(d.portal));
  const draft = useDraft(d);
  const merging = useMergeWith(d);
  return (
    <Stack>
      <Actions d={d} ask={ask} merge={merging.open} />
      {view}
      {merging.view(ask)}
      <ProcessScope d={d} ask={ask} />
      {d.archived_at && !d.scope?.merged_into && (
        <Callout title="Archived">
          {`Archived ${d.archived_at}. It is out of the list and its screens count as in no process; nothing was deleted. `}
          <Button
            size="md"
            variant="strong"
            onClick={() =>
              ask({
                title: `Restore ${d.name}?`,
                text: 'It goes back in the list with every revision, draft and spec it had.',
                confirm: 'Restore',
                write: writes.unarchive(d.portal, d.id, d.rev),
              })
            }
          >
            Restore
          </Button>
        </Callout>
      )}
      <ModelSwitch d={d} ask={ask} setModel={(model) => setView({ model })} />
      <ProcessFacts d={d} ask={ask} />
      {d.as_is && <AsIsDocumentation d={d} a={d.as_is} ask={ask} />}
      <DraftBar d={d} ask={ask} failed={draft.failed} />
      <Columns
        main={
          <Stack>
            <ProcessSteps d={d} ask={ask} draft={draft} select={(step) => setView({ model: d.model.label, step })} />
            <AsIsReference d={d} />
          </Stack>
        }
        side={<SelectedStep d={d} draft={draft} />}
      />
    </Stack>
  );
}

/** One process (designer screens 05, v2-10): its models, what the portal model knows of it, A as documentation. */
export function Process() {
  const { portal = '', key = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const model = params.get('model') ?? '';
  const step = params.get('step') ?? '';
  const setView = (next: { model?: string; step?: string }) => {
    const p: Record<string, string> = {};
    if (next.model) p.model = next.model;
    if (next.step) p.step = next.step;
    setParams(p, { replace: true });
  };
  const q = useProcessPage(portal, key, model, step);
  const d = q.data;
  const context = d ? { type: 'process' as const, id: `${d.id}:${d.model.label}`, label: `${d.key} ${d.name} · ${d.model.label}`, rev: d.model.rev } : null;
  return (
    <Shell current="processes" context={context}>
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          { label: 'Processes', href: `/app/portals/${encodeURIComponent(portal)}/processes` },
          { label: key },
        ]}
        title={d ? <Text asIs>{d.name}</Text> : key}
        meta={headMeta(q, (p) => <Meta d={p} />)}
      />
      <QueryState query={q} what="the process">
        {(p) => <Body d={p} setView={setView} />}
      </QueryState>
    </Shell>
  );
}
