import { ViewNav } from '../design-system';

/** The views of Scans: every scan, the scans by documented process, and the calls made outside any scan. */
export function ScansViews({ portal, current }: { portal: string; current: 'all' | 'by-process' | 'activity' }) {
  const base = `/app/portals/${encodeURIComponent(portal)}/scans`;
  return (
    <ViewNav
      label="Scans views"
      items={[
        { href: base, label: 'All scans', current: current === 'all' },
        { href: `${base}/by-process`, label: 'By process', current: current === 'by-process' },
        { href: `${base}/activity`, label: 'Server activity', current: current === 'activity' },
      ]}
    />
  );
}
