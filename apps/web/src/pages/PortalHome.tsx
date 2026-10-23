import { useParams } from 'react-router';
import {
  Callout,
  Cluster,
  Count,
  Facts,
  Grid,
  PageHead,
  Plate,
  Row,
  Rows,
  Stack,
  Table,
  Tag,
  Text,
} from '../design-system';
import { usePortalHome, type PortalHomeData } from '../app/api';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';

type Item = PortalHomeData['needs']['top'][number];
type ProcessRow = PortalHomeData['changes']['by_process'][number];

const changeColumns = [
  { header: 'Process', cell: (p: ProcessRow) => p.name, rowHeader: true },
  { header: 'Changes', cell: (p: ProcessRow) => p.changes, numeric: true },
  { header: 'Need you', cell: (p: ProcessRow) => p.needs, numeric: true },
  { header: 'Explained', cell: (p: ProcessRow) => p.explained, numeric: true },
];

function NeedsRow({ item }: { item: Item }) {
  return (
    <Row tone="intent" aside={item.status ? <ShownStatus status={item.status} /> : <Text muted small>{item.at}</Text>}>
      <Cluster>
        <ShownChip chip={item.chip} />
      </Cluster>
      {item.claim}
      {item.where && (
        <>
          {' '}
          <Text muted small>
            {item.where}
          </Text>
        </>
      )}
    </Row>
  );
}

function LastScan({ scan }: { scan: PortalHomeData['last_scan'] }) {
  return (
    <Plate title="Last scan">
      {scan ? (
        <Stack>
          {/* the full scan id on its own line: beside a fact name it is wider than a phone (D-9) */}
          <Tag size="sm">{scan.id}</Tag>
          <Facts
            items={[
              ['Status', <ShownStatus status={scan.status} />],
              ['Kind', scan.kind],
              ['Steps', scan.steps],
              ['Started (UTC)', <Text mono>{scan.started_at}</Text>],
            ]}
          />
        </Stack>
      ) : (
        <Callout>No scan yet. Start one from the chat.</Callout>
      )}
    </Plate>
  );
}

/** Each portal part's latest release; a dashed row is told apart by asset hashes, not a marker. */
function Releases({ lanes }: { lanes: PortalHomeData['lanes'] }) {
  return (
    <Plate title="Releases" flush={lanes.length > 0}>
      {lanes.length === 0 ? (
        <Callout>No release seen yet.</Callout>
      ) : (
        <Rows label="Releases by part">
          {lanes.map((l) => (
            <Row key={l.part} aside={<Text mono small>{l.since}</Text>} {...(l.observed ? {} : { tone: 'dashed' as const })}>
              {l.part} <Tag size="sm">{l.release}</Tag>
              {l.was && (
                <>
                  {' '}
                  <Text muted small>
                    was {l.was}
                  </Text>
                </>
              )}
            </Row>
          ))}
        </Rows>
      )}
    </Plate>
  );
}

function Home({ h }: { h: PortalHomeData }) {
  return (
    <Stack>
      <Plate
        title="Needs you"
        variant="intent"
        flush={h.needs.top.length > 0}
        actions={<Count>{h.needs.total}</Count>}
      >
        {h.needs.top.length === 0 ? (
          <Callout>Nothing waits for you on this portal.</Callout>
        ) : (
          <Rows label="What needs you">
            {h.needs.top.map((it) => (
              <NeedsRow key={`${it.kind}-${it.id}`} item={it} />
            ))}
          </Rows>
        )}
      </Plate>
      <Grid min="18rem">
        <LastScan scan={h.last_scan} />
        <Plate title="The model">
          <Facts
            items={[
              ['Version', h.model_seq ?? 'not built yet'],
              ['Processes', h.processes],
              ['Proposed', h.proposed],
              ['Rules', h.rules.total],
            ]}
          />
        </Plate>
        <Releases lanes={h.lanes} />
      </Grid>
      <Plate title="Changes by process" flush actions={<Count muted>{h.changes.all}</Count>}>
        <Table
          caption={`Changes on ${h.portal} by process`}
          columns={changeColumns}
          rows={h.changes.by_process}
          rowKey={(p) => p.key ?? p.name}
          flush
          empty="No change seen since the model was built."
        />
      </Plate>
      {h.rules.by_status.length > 0 && (
        <Plate title="Rules">
          <Facts items={h.rules.by_status.map((r) => [<ShownStatus status={r.status} />, r.count] as const)} />
        </Plate>
      )}
    </Stack>
  );
}

/** A portal's home (designer screen v2-01): what needs you first, then the last scan, the model, the releases and the changes. */
export function PortalHome() {
  const portal = useParams().portal ?? '';
  const q = usePortalHome(portal);
  return (
    <Shell current="home">
      <PageHead
        crumbs={[{ label: 'Portals', href: '/app/' }, { label: portal }]}
        title={portal}
        meta={q.data ? `environment ${q.data.environment}` : undefined}
      />
      <QueryState query={q} what="the portal">
        {(h) => <Home h={h} />}
      </QueryState>
    </Shell>
  );
}
