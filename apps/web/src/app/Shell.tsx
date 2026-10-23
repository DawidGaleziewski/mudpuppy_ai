import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { AppShell, Button, Callout, Cluster, LinkButton, SearchBox, Stack, Text, type NavGroup } from '../design-system';
import type { PageContext } from './api-assistant';
import { usePortals } from './api';
import { searchHref } from './api-lists';
import { AsOfBanner, AsOfMenu } from './AsOfMenu';
import { StoreBanner, StoreMenu } from './StoreMenu';
import { useGo } from './RouterAnchor';
import { AssistantContext, keepSay } from './assistant-context';
import { AssistantDrawer } from './AssistantDrawer';
import { PortalMenu } from './PortalMenu';

const OPEN_KEY = 'mudpuppy.assistant.open';
const LAST_PORTAL_KEY = 'mudpuppy.portal.last';

function storedPortal(): string | undefined {
  try {
    return localStorage.getItem(LAST_PORTAL_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The portal used last in this browser (a per-viewer convenience): the nav on All portals points
 * at it. One the store no longer lists is forgotten.
 */
function useLastPortal(portal: string | undefined, known: string[] | undefined): string | undefined {
  const last = portal ?? storedPortal();
  useEffect(() => {
    if (portal === undefined) return;
    try {
      localStorage.setItem(LAST_PORTAL_KEY, portal);
    } catch {
      // nothing to keep it in: All portals shows only Portals
    }
  }, [portal]);
  return last !== undefined && known?.includes(last) ? last : undefined;
}

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

/**
 * The assistant drawer's state: open across pages in this session; Ctrl+J opens and closes it; an
 * address with `?assistant=open` opens it (a request sent to the conversation is followed there,
 * designer Q11: no full chat page).
 */
function useAssistantOpen() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('assistant') === 'open';
  const [open, setOpen] = useState(() => asked || storedOpen());
  // the frame stays mounted (R-103 (5)): an address that asks later opens the drawer too
  const [wasAsked, setWasAsked] = useState(asked);
  if (asked !== wasAsked) {
    setWasAsked(asked);
    if (asked) setOpen(true);
  }
  const turn = useCallback((next: boolean) => {
    setOpen(next);
    keepOpen(next);
  }, []);
  useEffect(() => {
    if (!asked) return;
    // the drawer opened with the address; keep it open on the next pages
    keepOpen(true);
    setParams(
      (p) => {
        p.delete('assistant');
        return p;
      },
      { replace: true },
    );
  }, [asked, setParams]);
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

type Section = 'portals' | 'home' | 'changes' | 'review' | 'processes' | 'screens' | 'rules' | 'docs' | 'scans' | 'settings' | 'search' | 'glossary' | 'workbench';

/** The portal's sections in the 2.0 grouping, the current one marked; the Workbench while its beta is on. */
function navOf(portal: string | undefined, current: Section, workbench: boolean): NavGroup[] {
  const at = (s: Section) => current === s;
  const portals = { items: [{ href: '/app/', label: 'Portals', current: at('portals') }] };
  if (!portal) return [portals];
  const base = `/app/portals/${encodeURIComponent(portal)}`;
  return [
    portals,
    {
      items: [
        { href: base, label: 'Home', current: at('home') },
        { href: `${base}/changes`, label: 'Changes', current: at('changes') },
        { href: `${base}/review`, label: 'Review', current: at('review') },
      ],
    },
    {
      label: 'Portal model',
      items: [
        { href: `${base}/processes`, label: 'Processes', current: at('processes') },
        { href: `${base}/screens`, label: 'Screens', current: at('screens') },
        { href: `${base}/rules`, label: 'Rules', current: at('rules') },
        { href: `${base}/docs`, label: 'Docs', current: at('docs') },
      ],
    },
    {
      label: 'Machine',
      items: [
        { href: `${base}/scans`, label: 'Scans', current: at('scans') },
        ...(workbench ? [{ href: `${base}/workbench`, label: 'Workbench', current: at('workbench') }] : []),
        { href: `${base}/settings`, label: 'Settings', current: at('settings') },
      ],
    },
  ];
}

/** MCP servers answering on another environment or checkout than the console (R-61): each named. */
function StrayServers({ warnings }: { warnings: string[] | undefined }) {
  if (!warnings?.length) return null;
  return (
    <Callout tone="failure" title="A server disagrees with this console">
      <Stack>
        {warnings.map((w) => (
          <Text key={w} block>{w}</Text>
        ))}
      </Stack>
    </Callout>
  );
}

/** The header's end: As of on a model page, the assistant's button, help and the glossary. */
function HeaderEnd({ portal, model, open, turn }: { portal: string | undefined; model: boolean; open: boolean; turn: (open: boolean) => void }) {
  return (
    <Cluster>
      <StoreMenu portal={portal} />
      {portal && model && <AsOfMenu portal={portal} />}
      {portal && (
        <Button size="sm" variant={open ? 'default' : 'quiet'} aria-expanded={open} onClick={() => turn(!open)}>
          Ask the assistant
        </Button>
      )}
      <LinkButton size="sm" variant="quiet" href="/app/glossary" aria-label="Help and glossary">
        ?
      </LinkButton>
    </Cluster>
  );
}

/** What a page tells the frame: its section, its portal when the address lacks it, its context. */
interface FrameOf {
  current: Section;
  /** The portal when the address does not name it (a scan's page). */
  portal?: string | undefined;
  /** What "This page" means for the assistant (spec 022 R6); none: the whole yard only. */
  context?: PageContext | null;
}

const FrameContext = createContext<(frame: FrameOf) => void>(() => undefined);

const sameFrame = (a: FrameOf, b: FrameOf) =>
  a.current === b.current && a.portal === b.portal && JSON.stringify(a.context ?? null) === JSON.stringify(b.context ?? null);

/**
 * The console frame, drawn once around every page (R-103 (5)): a nav click swaps only the page,
 * so the header, the nav and the assistant drawer stay as they are (no blink, the drawer keeps its
 * conversation). Each page hands up its section, portal and context with `Shell`.
 */
export function ShellLayout({ children }: { children: ReactNode }) {
  const [frame, setFrame] = useState<FrameOf>({ current: 'portals' });
  const hand = useCallback((next: FrameOf) => setFrame((prev) => (sameFrame(prev, next) ? prev : next)), []);
  return (
    <FrameContext.Provider value={hand}>
      <Frame {...frame}>{children}</Frame>
    </FrameContext.Provider>
  );
}

/**
 * A page's part of the frame: its section marked in the nav, its portal and what "This page" means
 * for the assistant; the frame itself is `ShellLayout`'s, drawn once.
 */
export function Shell({ current, portal, context = null, children }: FrameOf & { children: ReactNode }) {
  const hand = useContext(FrameContext);
  // before paint, so the nav marks the new section in the same frame the page appears
  useLayoutEffect(() => hand({ current, portal, context }), [hand, current, portal, context]);
  return <>{children}</>;
}

function Frame({ current, portal: given, context = null, children }: FrameOf & { children: ReactNode }) {
  const params = useParams();
  const portal = given ?? params.portal;
  const { open, turn } = useAssistantOpen();
  const close = useCallback(() => turn(false), [turn]);
  const { handle, nudge } = useAsk(turn);
  const go = useGo();
  const [query] = useSearchParams();
  const searched = current === 'search' ? (query.get('q') ?? '') : '';
  const portals = usePortals().data;
  const workbench = portals?.workbench === true;
  const last = useLastPortal(portal, portals?.portals.map((p) => p.id));
  // All portals keeps the whole nav, for the portal used last (designer v2-15, R-103 (3))
  const nav = navOf(portal ?? last, current, workbench);
  // the model pages follow As of (spec 040 FR-001)
  const model = current === 'processes' || current === 'screens' || current === 'rules';
  return (
    <AssistantContext.Provider value={handle}>
      <AppShell
        nav={nav}
        header={
          <>
            <PortalMenu portal={portal} />
            <SearchBox key={searched} value={searched} onSearch={(q) => go(searchHref(q, portal))} />
          </>
        }
        headerEnd={<HeaderEnd portal={portal} model={model} open={open} turn={turn} />}
        drawer={portal && open ? <AssistantDrawer portal={portal} context={context} onClose={close} nudge={nudge} /> : undefined}
      >
        <StoreBanner portal={portal} />
        <StrayServers warnings={portals?.warnings} />
        {model && <AsOfBanner />}
        {children}
      </AppShell>
    </AssistantContext.Provider>
  );
}
