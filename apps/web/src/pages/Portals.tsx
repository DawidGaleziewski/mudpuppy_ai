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
      <QueryState loading={q.isPending} error={q.error} what="the portals">
        {() => (
          <Stack>
            <Plate title="This environment" flush={data!.portals.length > 0}>
              {data!.portals.length === 0 ? (
                <Callout>No portal yet. Add one in the dashboard&apos;s Settings.</Callout>
              ) : (
                <Rows label="Portals">
                  {data!.portals.map((p) => (
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
            {data!.other_environments.length > 0 && (
              <Plate title="Other environments">
                {data!.other_environments.map((p) => (
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
