import { ViewNav } from '../design-system';

/** The views of Screens (v2-06, v2-08, screen 12): the model's screens as a list and as a map, and every recorded page. */
export function ScreensViews({
  portal,
  current,
  total,
}: {
  portal: string;
  current: 'list' | 'map' | 'recorded';
  total?: number;
}) {
  const base = `/app/portals/${encodeURIComponent(portal)}/screens`;
  return (
    <ViewNav
      label="Screens views"
      items={[
        { href: base, label: 'List', count: total, current: current === 'list' },
        { href: `${base}/map`, label: 'Map', current: current === 'map' },
        { href: `${base}/recorded`, label: 'Recorded pages', current: current === 'recorded' },
      ]}
    />
  );
}
