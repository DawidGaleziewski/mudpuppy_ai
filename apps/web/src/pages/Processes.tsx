import { useParams, useSearchParams } from 'react-router';
import { Button, Cluster, LinkButton, PageHead, Plate, Segmented, Split, Stack, Table, Tag, Text } from '../design-system';
import { processesKey, processHref, useProcesses, type ProcessList, type ProcessRow } from '../app/api-processes';
import { writes } from '../app/api-write';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';
import { NewProcess } from './NewProcess';
import { ProcessSuggestions } from './ProcessSuggestions';

function columns(d: ProcessList, ask: (a: Ask) => void) {
  return [
    {
      header: 'Process',
      rowHeader: true,
      cell: (r: ProcessRow) => (
        <Stack>
          <Text asIs href={processHref(d.portal, r.key)}>
            {r.name}
          </Text>
          <Cluster>
            <Tag size="sm">{r.key}</Tag>
            <Text route>{`${r.start_route ?? '—'} → ${r.end_route ?? '—'} · ${r.persona}`}</Text>
          </Cluster>
        </Stack>
      ),
    },
    { header: 'Stage', cell: (r: ProcessRow) => <ShownStatus status={r.stage} /> },
    {
      header: 'Process models',
      cell: (r: ProcessRow) => (
        <Stack>
          {r.models.map((m) => (
            <Cluster key={m.label}>
              <Tag size="sm" href={processHref(d.portal, r.key, m.label)}>{`${m.label} r${String(m.rev)}`}</Tag>
              <Text small muted>
                {m.kind}
              </Text>
              {m.draft && <ShownStatus status={m.draft} />}
            </Cluster>
          ))}
        </Stack>
      ),
    },
    { header: 'Live', cell: (r: ProcessRow) => <Live r={r} /> },
    { header: 'Screens', numeric: true, cell: (r: ProcessRow) => r.screens },
    { header: 'Amendments', numeric: true, cell: (r: ProcessRow) => r.amendments },
    { header: 'Last change', cell: (r: ProcessRow) => <LastChange r={r} d={d} ask={ask} /> },
  ];
}

/** Which model revision is live in each environment. */
function Live({ r }: { r: ProcessRow }) {
  if (r.live.length === 0) return <Text muted>—</Text>;
  return (
    <Stack>
      {r.live.map((l) => (
        <Cluster key={l.environment}>
          <ShownStatus status={l.status} />
          <Text small mono>
            {l.what}
          </Text>
          <Text small muted>
            {l.environment}
          </Text>
        </Cluster>
      ))}
    </Stack>
  );
}

/** Who changed it last and when; Restore on an archived process. */
function LastChange({ r, d, ask }: { r: ProcessRow; d: ProcessList; ask: (a: Ask) => void }) {
  return (
    <Stack>
      <Text small>
        {r.last_by} · <Text mono small>{r.last_at}</Text>
      </Text>
      {d.archived && (
        <Cluster>
          <Button
            size="sm"
            aria-label={`Restore ${r.name}`}
            onClick={() =>
              ask({
                title: `Restore ${r.name}?`,
                text: 'It goes back in the list with every revision, draft and spec it had.',
                confirm: 'Restore',
                write: writes.unarchive(d.portal, r.id, r.rev),
              })
            }
          >
            Restore
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}

function Yours({ d, ask, setView }: { d: ProcessList; ask: (a: Ask) => void; setView: (archived: boolean, page?: number) => void }) {
  return (
    <Stack>
      <Split>
        <Text small muted>
          {d.archived
            ? 'Archived processes keep every revision, draft and spec. Restore one to put it back in the list.'
            : `${String(d.total)} process${d.total === 1 ? '' : 'es'}`}
        </Text>
        {(d.archived || d.archived_count > 0) && (
          <Segmented
            label="Which processes"
            selected={d.archived ? 'archived' : 'in-use'}
            onSelect={(v) => setView(v === 'archived')}
            items={[
              { value: 'in-use', label: 'In use' },
              { value: 'archived', label: 'Archived', count: d.archived_count },
            ]}
          />
        )}
      </Split>
      <Plate title={`${d.archived ? 'Archived processes' : 'Your processes'} · ${String(d.total)}`} flush>
        <Table
          caption={`The BA's processes of ${d.portal}`}
          columns={columns(d, ask)}
          rows={d.rows}
          rowKey={(r) => r.id}
          flush
          empty={
            d.archived
              ? 'No archived processes. Archive a process from its page; nothing is deleted.'
              : "No processes yet. Accept one of the assistant's suggestions below, or start one from the screens in no process."
          }
        />
      </Plate>
      {d.pages > 1 && (
        <nav aria-label="Process pages">
          <Cluster>
            <Text small muted>{`Page ${String(d.page)} of ${String(d.pages)}`}</Text>
            {d.page > 1 && (
              <Button size="sm" variant="quiet" onClick={() => setView(d.archived, d.page - 1)}>
                Previous
              </Button>
            )}
            {d.page < d.pages && (
              <Button size="sm" variant="quiet" onClick={() => setView(d.archived, d.page + 1)}>
                Next
              </Button>
            )}
          </Cluster>
        </nav>
      )}
    </Stack>
  );
}

function Body({ d, setView }: { d: ProcessList; setView: (archived: boolean, page?: number) => void }) {
  const { ask, view } = useConfirmedWrite(processesKey(d.portal));
  return (
    <Stack>
      {view}
      <Cluster>
        <Text small muted>
          Stages
        </Text>
        {d.stages.map((s, i) => (
          <Text key={s.word} small>
            <ShownStatus status={s} />
            {i < d.stages.length - 1 ? ' →' : ''}
          </Text>
        ))}
        <Text small muted>
          A process can move back at any time.
        </Text>
      </Cluster>
      <Yours d={d} ask={ask} setView={setView} />
      <Plate title={`Suggested by the assistant · ${String(d.suggestions.length)}`}>
        <ProcessSuggestions portal={d.portal} suggestions={d.suggestions} suggested={d.suggested} ask={ask} />
      </Plate>
      <Plate title={`In no process · ${String(d.loose.length)} screens`} actions={<Text small href={`/app/portals/${encodeURIComponent(d.portal)}/screens/recorded`}>Show all in Screens</Text>}>
        <NewProcess portal={d.portal} loose={d.loose} persona={d.default_persona} ask={ask} />
      </Plate>
    </Stack>
  );
}

/** The BA's processes (designer screen 04): the list, the assistant's suggestions and the screens in no process. */
export function Processes() {
  const portal = useParams().portal ?? '';
  const [params, setParams] = useSearchParams();
  const archived = params.get('show') === 'archived';
  const page = Number(params.get('page') ?? '1') || 1;
  const setView = (a: boolean, p = 1) => {
    const next: Record<string, string> = {};
    if (a) next.show = 'archived';
    if (p > 1) next.page = String(p);
    setParams(next);
  };
  const q = useProcesses(portal, archived, page);
  return (
    <Shell current="processes">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          { label: 'Processes' },
        ]}
        title="Processes"
        meta={`Cut ${portal} into processes you can document, redesign and migrate one at a time.`}
        actions={
          <Cluster>
            <LinkButton href="/chat">Ask the assistant to regroup</LinkButton>
          </Cluster>
        }
      />
      <QueryState query={q} what="the processes">
        {(d) => <Body d={d} setView={setView} />}
      </QueryState>
    </Shell>
  );
}
