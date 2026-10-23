import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { AppShell, Chip, Text, type NavGroup } from '../design-system';

/** The console frame: the portal's sections in the 2.0 grouping, the current one marked. */
export function Shell({
  current,
  portal: given,
  children,
}: {
  current: 'portals' | 'home' | 'changes' | 'review' | 'processes' | 'screens' | 'rules' | 'docs' | 'scans';
  /** The portal when the address does not name it (a scan's page). */
  portal?: string | undefined;
  children: ReactNode;
}) {
  const params = useParams();
  const portal = given ?? params.portal;
  const base = portal ? `/app/portals/${encodeURIComponent(portal)}` : null;
  const nav: NavGroup[] = [
    { items: [{ href: '/app/', label: 'Portals', current: current === 'portals' }] },
    ...(base
      ? [
          {
            items: [
              { href: base, label: 'Home', current: current === 'home' },
              { href: `${base}/changes`, label: 'Changes', current: current === 'changes' },
              { href: `${base}/review`, label: 'Review', current: current === 'review' },
            ],
          },
          {
            label: 'Portal model',
            items: [
              { href: `${base}/processes`, label: 'Processes', current: current === 'processes' },
              { href: `${base}/screens`, label: 'Screens', current: current === 'screens' },
              { href: `${base}/rules`, label: 'Rules', current: current === 'rules' },
              { href: `${base}/docs`, label: 'Docs', current: current === 'docs' },
            ],
          },
          {
            label: 'Machine',
            items: [{ href: `${base}/scans`, label: 'Scans', current: current === 'scans' }],
          },
        ]
      : []),
  ];
  return (
    <AppShell
      nav={nav}
      header={portal ? <Text mono>{portal}</Text> : null}
      headerEnd={<Chip variant="dashed">React preview</Chip>}
    >
      {children}
    </AppShell>
  );
}
