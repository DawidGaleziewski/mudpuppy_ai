import { isSection } from './api-scan-tabs';

/**
 * Where a scan's section lives: Graph is the scan's own address, a moved section its React page,
 * any other (Trace, Process) the htmx page until it moves.
 */
export function scanTabHref(scan: string, tab: string) {
  const base = `/app/scans/${encodeURIComponent(scan)}`;
  if (tab === 'graph') return base;
  return isSection(tab) ? `${base}/${tab}` : `/runs/${encodeURIComponent(scan)}?tab=${tab}`;
}
