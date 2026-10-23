import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { AppShell, Chip, Text, type NavGroup } from '../design-system';

/** The console frame: the portal's sections in the 2.0 grouping, the current one marked. */
export function Shell({ current, children }: { current: 'portals' | 'home' | 'scans'; children: ReactNode }) {
  const { portal } = useParams();
  const base = portal ? `/app/portals/${encodeURIComponent(portal)}` : null;
  const nav: NavGroup[] = [
    { items: [{ href: '/app/', label: 'Portals', current: current === 'portals' }] },
    ...(base
      ? [
          { items: [{ href: base, label: 'Home', current: current === 'home' }] },
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
