import { Callout, Count, PageHead, Plate, Row, Rows, Stack, Status, Tag, Text } from '../design-system';
import { usePortals } from '../app/api';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';

/** The portals of this store: where to start (the htmx Home's portal list, R-96). */
export function Portals() {
  const q = usePortals();
  const data = q.data;
  return (
    <Shell current="portals">
      <PageHead
        title="Portals"
        meta={data ? `${String(data.portals.length)} portals · environment ${data.environment}` : undefined}
      />
      <QueryState query={q} what="the portals">
        {(list) => (
          <Stack>
            <Plate title="This environment" flush={list.portals.length > 0}>
              {list.portals.length === 0 ? (
                <Callout>No portal yet. Add one in the dashboard&apos;s Settings.</Callout>
              ) : (
                <Rows label="Portals">
                  {list.portals.map((p) => (
                    <Row
                      key={p.id}
                      aside={
                        p.running > 0 ? (
                          <Status status="running">{`${String(p.running)} running`}</Status>
                        ) : (
                          <Count muted>{p.scans}</Count>
                        )
                      }
                    >
                      <a href={`/app/portals/${encodeURIComponent(p.id)}`}>{p.id}</a>
                      {p.last_scan_at && (
                        <>
                          {' '}
                          <Text muted small>
                            last scan {p.last_scan_at}
                          </Text>
                        </>
                      )}
                    </Row>
                  ))}
                </Rows>
              )}
            </Plate>
            {list.other_environments.length > 0 && (
              <Plate title="Other environments">
                {list.other_environments.map((p) => (
                  <Tag key={p} size="sm">
                    {p}
                  </Tag>
                ))}
              </Plate>
            )}
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
