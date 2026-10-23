import { ViewNav } from '../design-system';

/** The views of Screens (v2-06, v2-08): the model's screens as a list and as a map. */
export function ScreensViews({ portal, current, total }: { portal: string; current: 'list' | 'map'; total?: number }) {
  const base = `/app/portals/${encodeURIComponent(portal)}/screens`;
  return (
    <ViewNav
      label="Screens views"
      items={[
        { href: base, label: 'List', count: total, current: current === 'list' },
        { href: `${base}/map`, label: 'Map', current: current === 'map' },
      ]}
    />
  );
}
