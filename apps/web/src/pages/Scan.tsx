import { useParams } from 'react-router';
import { Callout, Facts, PageHead, Plate, Stack, Text, ViewNav } from '../design-system';
import { useScanHead, type ScanHead } from '../app/api-scan';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';
import { ScanGraph } from './ScanGraph';

/** The scan's other tabs stay on the htmx page until they move (a later step of R-96). */
const tabHref = (scan: string, tab: string) =>
  tab === 'graph' ? `/app/scans/${encodeURIComponent(scan)}` : `/runs/${encodeURIComponent(scan)}?tab=${tab}`;

function Head({ h }: { h: ScanHead }) {
  return (
    <Stack>
      <Plate title="Summary" actions={<ShownStatus status={h.status} />}>
        <Stack>
          {h.warning && <Callout tone="failure">{h.warning}</Callout>}
          <Facts
            items={[
              ['Portal', h.portal],
              ['Persona', h.persona],
              ...h.facts.map((f) => [f.label, <Text mono>{f.value}</Text>] as const),
            ]}
          />
        </Stack>
      </Plate>
      <ViewNav
        label="Scan sections"
        items={h.tabs.map((t) => ({
          href: tabHref(h.id, t.id),
          label: t.label,
          count: t.count,
          current: t.id === 'graph',
        }))}
      />
    </Stack>
  );
}

/** One scan (the htmx `/runs/{id}`): its summary, its sections, and the Graph tab with its restarts. */
export function Scan() {
  const scan = useParams().scan ?? '';
  const q = useScanHead(scan);
  const portal = q.data?.portal;
  return (
    <Shell current="scans" portal={portal}>
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          ...(portal
            ? [
                { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
                { label: 'Scans', href: `/app/portals/${encodeURIComponent(portal)}/scans` },
              ]
            : []),
          { label: 'Scan' },
        ]}
        title={
          <>
            Scan <Text mono>{scan}</Text>
          </>
        }
        meta={q.data ? `${q.data.persona} · read-only` : undefined}
      />
      <QueryState query={q} what="the scan">
        {(h) => (
          <Stack>
            <Head h={h} />
            <ScanGraph scan={h.id} />
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
