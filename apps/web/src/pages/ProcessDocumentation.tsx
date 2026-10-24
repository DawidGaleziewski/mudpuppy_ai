import { useParams, useSearchParams } from 'react-router';
import { Callout, LinkButton, PageHead, Plate, Prose, Stack, ViewNav } from '../design-system';
import { api, read } from '../app/state/api';
import { exportHref } from '../app/api-processes';
import { QueryState } from '../app/QueryState';
import { useGo } from '../app/RouterAnchor';
import { Shell } from '../app/Shell';

interface ExportPage {
  portal: string;
  key: string;
  tabs: { file: string; label: string }[];
  tab: string;
  html: string | null;
  error: string | null;
  zip: string;
}

const exportApi = api.injectEndpoints({
  endpoints: (b) => ({
    processExport: read<ExportPage, { portal: string; key: string; tab: string }>(
      b,
      ({ portal, key, tab }) => `/api/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(key)}/export?tab=${encodeURIComponent(tab)}`,
      ({ portal, key, tab }) => ['portals', portal, 'processes', key, 'export', tab],
    ),
  }),
});

/** A documented process in the export's layout (spec 034 R-68): one tab per file, and the folder as a zip. */
export function ProcessDocumentation() {
  const { portal = '', key = '' } = useParams();
  const [params] = useSearchParams();
  const tab = params.get('tab') ?? 'README.md';
  const go = useGo();
  const q = exportApi.useProcessExportQuery({ portal, key, tab });
  const base = exportHref(portal, key);
  const back = key.startsWith('PRC-')
    ? { label: key, href: `/app/portals/${encodeURIComponent(portal)}/processes/${encodeURIComponent(key)}` }
    : { label: key, href: `/app/portals/${encodeURIComponent(portal)}/docs/${encodeURIComponent(key)}` };
  return (
    <Shell current={key.startsWith('PRC-') ? 'processes' : 'docs'}>
      <QueryState query={q} what="the documentation">
        {(d) => (
          <Stack>
            <PageHead
              crumbs={[back, { label: 'Documentation' }]}
              title={`${key} documentation`}
              meta="The rebuild-grade export of this process: the same files the download holds, built from the recorded scans and the BA's records."
              actions={d.html !== null && <LinkButton variant="primary" href={d.zip} download>Download the folder (zip)</LinkButton>}
            />
            {d.html === null ? (
              <Callout title={`No documentation export for ${key}`}>{`The export could not be built: ${d.error ?? ''}`}</Callout>
            ) : (
              <>
                <ViewNav label="Files of the export" items={d.tabs.map((t) => ({ href: `${base}?tab=${encodeURIComponent(t.file)}`, label: t.label, current: t.file === d.tab }))} />
                <Plate>
                  <Prose html={d.html} label={d.tab} onLink={go} />
                </Plate>
              </>
            )}
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
