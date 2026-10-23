import type { ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { RecordingView } from '../app/Recording';
import { isScanTab, scanTabHref as tabHref, type ScanTab } from '../app/scanLinks';
import { ActionsSection, DecisionsSection, FrontierSection } from './ScanFiltered';
import { DocsSection, FormsSection, NetworkSection, RobotsSection, StatesSection } from './ScanLists';
import { ProcessSection } from './ScanProcess';
import { TraceSection } from './ScanTrace';
import { Callout, Facts, PageHead, Plate, ScanId, Stack, Table, Text, ViewNav } from '../design-system';
import { useScanHead, type ScanHead } from '../app/api-scan';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';
import { ScanGraph } from './ScanGraph';

const SECTION_VIEWS: Record<ScanTab, (p: { scan: string }) => ReactNode> = {
  states: StatesSection,
  actions: ActionsSection,
  frontier: FrontierSection,
  forms: FormsSection,
  network: NetworkSection,
  robots: RobotsSection,
  decisions: DecisionsSection,
  docs: DocsSection,
  trace: TraceSection,
  process: ProcessSection,
};

function Section({ scan, tab }: { scan: string; tab: string }) {
  if (!isScanTab(tab)) return <ScanGraph scan={scan} />;
  const View = SECTION_VIEWS[tab];
  return <View scan={scan} />;
}

/** The portal hooks that ran in the scan (spec 023 US2.3): where, how often, with which outcomes. */
function Hooks({ hooks }: { hooks: NonNullable<ScanHead['hooks']> }) {
  return (
    <Plate title={`Portal hooks · ${String(hooks.length)}`} flush>
      <Table
        caption="Portal hooks that ran in this scan"
        dense
        flush
        rows={hooks}
        rowKey={(h) => `${h.point}:${h.fn}`}
        columns={[
          { header: 'Hook', rowHeader: true, cell: (h) => <Text mono small>{`${h.point} · ${h.fn}`}</Text> },
          { header: 'Runs', numeric: true, cell: (h) => h.runs },
          { header: 'Outcomes', cell: (h) => Object.entries(h.outcomes).map(([k, n]) => `${String(n)} ${k}`).join(' · ') },
          { header: 'Pages patched', numeric: true, cell: (h) => h.pages_patched },
        ]}
      />
    </Plate>
  );
}

function Head({ h, tab }: { h: ScanHead; tab: string }) {
  return (
    <Stack>
      <Plate title="Summary" actions={<ShownStatus status={h.status} />}>
        <Stack>
          {h.warning && <Callout tone="failure">{h.warning}</Callout>}
          {/* the scan's own page: the whole id written out once, with Copy (D-9, Q6) */}
          <ScanId id={h.id} full copy />
          <Facts
            items={[
              ['Portal', h.portal],
              ['Persona', h.persona],
              ...h.facts.map((f) => [f.label, <Text mono>{f.value}</Text>] as const),
            ]}
          />
        </Stack>
      </Plate>
      {h.hooks && h.hooks.length > 0 && <Hooks hooks={h.hooks} />}
      <ViewNav
        label="Scan sections"
        items={h.tabs.map((t) => ({
          href: tabHref(h.id, t.id),
          label: t.label,
          count: t.count,
          current: t.id === tab,
        }))}
      />
    </Stack>
  );
}

/** One scan: its summary, its sections, and the Graph tab with its restarts. */
export function Scan() {
  const { scan = '', tab: given = 'graph' } = useParams();
  const tab = isScanTab(given) ? given : 'graph';
  const q = useScanHead(scan);
  const portal = q.data?.portal;
  // a recording no screen holds yet opens over its scan (designer Q10)
  const [params, setParams] = useSearchParams();
  const recording = params.get('recording');
  const close = () =>
    setParams((p) => {
      p.delete('recording');
      p.delete('hl');
      return p;
    });
  return (
    <Shell current="scans" portal={portal} context={q.data ? { type: 'scan', id: scan, label: `Scan of ${q.data.portal} as ${q.data.persona}` } : null}>
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
            Scan <ScanId id={scan} />
          </>
        }
        meta={q.data ? `${q.data.persona} · read-only` : undefined}
      />
      <QueryState query={q} what="the scan">
        {(h) => (
          <Stack>
            <Head h={h} tab={tab} />
            <Section scan={h.id} tab={tab} />
            {recording && <RecordingView key={recording} state={recording} hl={params.get('hl')} onClose={close} />}
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
