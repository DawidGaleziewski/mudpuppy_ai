import { useSearchParams } from 'react-router';
import { Callout, Cluster, PageHead, Plate, Row, Rows, ScanId, Stack, Tag, Text } from '../design-system';
import { useSearch, type SearchPage } from '../app/api-lists';
import { stateHref } from '../app/api-state';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

function Found({ r }: { r: SearchPage }) {
  if (!r.q) return <Callout>Type in the search field above (Ctrl K).</Callout>;
  if (!r.total)
    return (
      <Callout title={`Nothing found for “${r.q}”`}>
        Search looks in screen titles and routes, record keys and titles, and scan ids. Try a shorter word, or search every portal.
      </Callout>
    );
  return (
    <Stack>
      {r.screens.length > 0 && (
        <Plate title={`Screens · ${String(r.screens.length)}`} flush>
          <Rows label="Screens">
            {r.screens.map((s) => (
              <Row key={s.state} aside={<Text route>{s.route}</Text>}>
                <Text asIs href={stateHref(s.state)}>{s.title}</Text>
              </Row>
            ))}
          </Rows>
        </Plate>
      )}
      {r.records.length > 0 && (
        <Plate title={`Records · ${String(r.records.length)}`} flush>
          <Rows label="Records">
            {r.records.map((d) => (
              <Row key={`${d.portal}-${d.key}`} aside={<Text small muted>{r.portal ? d.kind : `${d.kind} · ${d.portal}`}</Text>}>
                <Cluster>
                  <Tag size="sm" href={`/app/portals/${encodeURIComponent(d.portal)}/docs/${encodeURIComponent(d.key)}`}>{d.key}</Tag>
                  <Text asIs>{d.title}</Text>
                </Cluster>
              </Row>
            ))}
          </Rows>
        </Plate>
      )}
      {r.scans.length > 0 && (
        <Plate title={`Scans · ${String(r.scans.length)}`} flush>
          <Rows label="Scans">
            {r.scans.map((s) => (
              <Row key={s.id} aside={<Text mono small>{s.started_at}</Text>}>
                <Cluster>
                  <ScanId id={s.id} href={`/app/scans/${encodeURIComponent(s.id)}`} tag />
                  <ShownStatus status={s.status} />
                  <Text small>{`${s.portal} · ${s.mode}`}</Text>
                </Cluster>
              </Row>
            ))}
          </Rows>
        </Plate>
      )}
    </Stack>
  );
}

/** Search (Ctrl K): screens by title or route, records by key or title, scans by id; in one portal or all. */
export function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const portal = params.get('portal');
  const query = useSearch(q, portal);
  return (
    <Shell current="search" portal={portal ?? undefined}>
      <PageHead
        title="Search"
        meta={query.data?.q ? `${String(query.data.total)} part${query.data.total === 1 ? '' : 's'} for “${query.data.q}”${portal ? ` in ${portal}` : ''}` : undefined}
      />
      <QueryState query={query} what="the search">
        {(r) => <Found r={r} />}
      </QueryState>
    </Shell>
  );
}
