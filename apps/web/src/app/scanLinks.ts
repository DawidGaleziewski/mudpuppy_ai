import { SECTIONS } from './api-scan-tabs';

/** A scan's sections besides Graph, each a React page since spec 056. */
export const SCAN_TABS = [...SECTIONS, 'trace', 'process'] as const;
export type ScanTab = (typeof SCAN_TABS)[number];

export const isScanTab = (tab: string): tab is ScanTab => (SCAN_TABS as readonly string[]).includes(tab);

/** Where a scan's section lives: Graph is the scan's own address, every other section its page under it. */
export function scanTabHref(scan: string, tab: string) {
  const base = `/app/scans/${encodeURIComponent(scan)}`;
  return isScanTab(tab) ? `${base}/${tab}` : base;
}
