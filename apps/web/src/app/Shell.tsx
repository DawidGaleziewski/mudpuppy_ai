import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { AppShell, Button, Chip, Cluster, Text, type NavGroup } from '../design-system';
import type { PageContext } from './api-assistant';
import { AssistantContext, keepSay } from './assistant-context';
import { AssistantDrawer } from './AssistantDrawer';

const OPEN_KEY = 'mudpuppy.assistant.open';

// Whether the drawer is open is a per-viewer convenience for the session; storage may be missing.
function storedOpen(): boolean {
  try {
    return sessionStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function keepOpen(open: boolean) {
  try {
    if (open) sessionStorage.setItem(OPEN_KEY, '1');
    else sessionStorage.removeItem(OPEN_KEY);
  } catch {
    // nothing to keep it in: the drawer stays as it is until the page changes
  }
}

/** The assistant drawer's state: open across pages in this session; Ctrl+J opens and closes it. */
function useAssistantOpen() {
  const [open, setOpen] = useState(storedOpen);
  const turn = useCallback((next: boolean) => {
    setOpen(next);
    keepOpen(next);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((o) => {
          keepOpen(!o);
          return !o;
        });
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return { open, turn };
}

/** What a page can ask of the drawer (`useAssistantHandle`); `nudge` is bumped on every ask, so an open drawer looks for the waiting message again. */
function useAsk(turn: (open: boolean) => void) {
  const [nudge, setNudge] = useState(0);
  const handle = useMemo(
    () => ({
      ask: (text?: string) => {
        if (text) keepSay(text);
        setNudge((n) => n + 1);
        turn(true);
      },
    }),
    [turn],
  );
  return { handle, nudge };
}

/** The console frame: the portal's sections in the 2.0 grouping, the current one marked, and the assistant. */
export function Shell({
  current,
  portal: given,
  context = null,
  children,
}: {
  current: 'portals' | 'home' | 'changes' | 'review' | 'processes' | 'screens' | 'rules' | 'docs' | 'scans' | 'settings';
  /** The portal when the address does not name it (a scan's page). */
  portal?: string | undefined;
  /** What "This page" means for the assistant (spec 022 R6); none: the whole yard only. */
  context?: PageContext | null;
  children: ReactNode;
}) {
  const params = useParams();
  const portal = given ?? params.portal;
  const { open, turn } = useAssistantOpen();
  const close = useCallback(() => turn(false), [turn]);
  const { handle, nudge } = useAsk(turn);
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
            items: [
              { href: `${base}/scans`, label: 'Scans', current: current === 'scans' },
              { href: `${base}/settings`, label: 'Settings', current: current === 'settings' },
            ],
          },
        ]
      : []),
  ];
  return (
    <AssistantContext.Provider value={handle}>
      <AppShell
        nav={nav}
        header={portal ? <Text mono>{portal}</Text> : null}
        headerEnd={
          <Cluster>
            {portal && (
              <Button size="sm" variant={open ? 'default' : 'quiet'} aria-expanded={open} onClick={() => turn(!open)}>
                Ask the assistant
              </Button>
            )}
            <Chip variant="dashed">React preview</Chip>
          </Cluster>
        }
        drawer={portal && open ? <AssistantDrawer portal={portal} context={context} onClose={close} nudge={nudge} /> : undefined}
      >
        {children}
      </AppShell>
    </AssistantContext.Provider>
  );
}
