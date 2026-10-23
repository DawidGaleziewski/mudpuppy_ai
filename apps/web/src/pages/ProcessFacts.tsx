import { Button, Cluster, Facts, Path, Plate, Stack, Table, Tag, Text } from '../design-system';
import type { ModelFacts, ProcessPage } from '../app/api-process';
import { writes } from '../app/api-write';
import type { Ask } from '../app/ConfirmedWrite';
import { ShownStatus } from '../app/ShownStatus';

type PathRow = ModelFacts['paths'][number];

const screenHref = (portal: string, key: string) =>
  `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}`;

function pathColumns(portal: string) {
  return [
    { header: 'Path', rowHeader: true, cell: (p: PathRow) => p.name },
    {
      header: 'Screens walked',
      cell: (p: PathRow) => (
        <Path
          label={`Path ${p.name}`}
          steps={p.screens.map(([key, title]) => ({
            id: key,
            label: (
              <Text asIs href={screenHref(portal, key)}>
                {title || key}
              </Text>
            ),
          }))}
        />
      ),
    },
    { header: 'Outcome', cell: (p: PathRow) => p.outcome },
    { header: 'Cases', numeric: true, cell: (p: PathRow) => p.count },
  ];
}

/** How far the process was explored, and Explore now (the owner's yes to a check run). */
function Explored({ d, m, ask }: { d: ProcessPage; m: ModelFacts; ask: (a: Ask) => void }) {
  return (
    <Stack>
      <Cluster>
        <ShownStatus status={m.explored} />
        {m.explored_text && <Text small>{m.explored_text}</Text>}
      </Cluster>
      <Cluster>
        <Button
          size="sm"
          onClick={() =>
            ask({
              title: `Explore ${d.name} now?`,
              text: 'The headless driver explores the process; the model takes the results on its next rebuild.',
              confirm: 'Explore now',
              write: writes.explore(d.portal, d.key),
            })
          }
        >
          Explore now
        </Button>
      </Cluster>
    </Stack>
  );
}

/** The business rules decided on the process's screens (htmx Rules until it moves). */
function Rules({ m }: { m: ModelFacts }) {
  if (m.rules.length === 0) return <Text muted>No rule decided on these screens.</Text>;
  return (
    <Stack>
      {m.rules.map((r) => (
        <Cluster key={r.key}>
          <Tag size="sm" href={`/rules/${encodeURIComponent(r.key)}`}>
            {r.key}
          </Tag>
          <Text asIs>{r.claim}</Text>
          <ShownStatus status={r.status} />
        </Cluster>
      ))}
    </Stack>
  );
}

/** What the portal model knows of the process (v2-10): triggers, outcomes, exploration, checks, rules; then its paths. */
export function ProcessFacts({ d, ask }: { d: ProcessPage; ask: (a: Ask) => void }) {
  const m = d.facts;
  if (!m) return null;
  const cases = m.paths.reduce((a, p) => a + p.count, 0);
  return (
    <Stack>
      <Plate title="In the portal model" actions={<Text small muted>{`model version ${String(m.model_seq)}`}</Text>}>
        <Facts
          items={[
            [
              'Triggers',
              m.triggers.length ? (
                <Stack>
                  {m.triggers.map((t) => (
                    <Cluster key={t.text}>
                      {t.screen_key && <Tag size="sm">{t.screen_key}</Tag>}
                      <Text asIs>{t.text}</Text>
                      <Text mono small>{`${String(t.count)}×`}</Text>
                    </Cluster>
                  ))}
                </Stack>
              ) : (
                <Text muted>No scan entered the process yet.</Text>
              ),
            ],
            ['Outcomes', m.outcomes.length ? m.outcomes.join(' · ') : '—'],
            ['Explored', <Explored d={d} m={m} ask={ask} />],
            ['Checked', m.checked ?? <Text muted>No action on its screens yet.</Text>],
            ['Business rules', <Rules m={m} />],
          ]}
        />
      </Plate>
      <Plate
        title="Paths"
        flush
        actions={<Text small muted>{`${String(m.paths.length)} path${m.paths.length === 1 ? '' : 's'} · ${String(cases)} case${cases === 1 ? '' : 's'}`}</Text>}
      >
        <Table
          caption="Paths through the process, the most walked first"
          columns={pathColumns(d.portal)}
          rows={m.paths}
          rowKey={(p) => p.name}
          flush
          empty="No path yet: a scan that enters the process through its trigger adds one on the next model rebuild."
        />
      </Plate>
    </Stack>
  );
}
