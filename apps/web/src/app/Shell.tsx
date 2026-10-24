import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { AppShell, Button, Callout, Cluster, Kbd, LinkButton, SearchBox, SrOnly, Stack, Status, Text, type NavGroup } from '../design-system';
import type { PageContext } from './api-assistant';
import { useAssistantStatus, usePortals } from './api';
import { searchHref } from './api-lists';
import { AsOfBanner, AsOfMenu } from './AsOfMenu';
import { StoreBanner, useStoreFollowsPortal } from './StoreMenu';
import { useGo } from './RouterAnchor';
import { AssistantContext, keepSay } from './assistant-context';
import { AssistantDrawer } from './AssistantDrawer';
import { PortalMenu } from './PortalMenu';
import { useRememberPortal } from './lastPortal';

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

/** Why a portal's sections are shut on All portals (designer T-12). */
const PICK_A_PORTAL = 'Pick a portal to open these.';

/**
 * All portals is a mode of its own (designer T-12, D-77): every section shows; Home is the
 * overview; the sections that need one portal are disabled with the reason. Changes, Review and
 * Settings have no across-portals page yet, so they are shut too (spec 078 D-1).
 */
function allPortalsNav(current: Section): NavGroup[] {
  const shut = (label: string) => ({ href: `#${label}`, label, disabled: true });
  return [
    { items: [{ href: '/app/', label: 'Home', current: current === 'portals' }, shut('Changes'), shut('Review')] },
    { label: 'Portal model', note: PICK_A_PORTAL, items: [shut('Processes'), shut('Screens'), shut('Rules'), shut('Docs')] },
    { label: 'Machine', items: [shut('Scans'), shut('Settings')] },
  ];
}

/** The portal's sections in the 2.0 grouping, the current one marked; the Workbench while its beta is on. */
function navOf(portal: string | undefined, current: Section, workbench: boolean): NavGroup[] {
  const at = (s: Section) => current === s;
  if (!portal) return allPortalsNav(current);
  const base = `/app/portals/${encodeURIComponent(portal)}`;
  return [
    { items: [{ href: '/app/', label: 'All portals', current: at('portals') }] },
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

/**
 * Ask, carrying the assistant's status (designer T-11): a square read as "Assistant up."; when
 * the chat service doesn't answer, ✕ and the word "down" show. Not known yet: no square.
 */
function AskButton({ open, turn }: { open: boolean; turn: (open: boolean) => void }) {
  const up = useAssistantStatus().data?.up;
  return (
    <Button size="sm" variant={open ? 'default' : 'quiet'} aria-expanded={open} aria-keyshortcuts="Control+J" onClick={() => turn(!open)}>
      {up === true && (
        <Status status="ok">
          <SrOnly>Assistant up.</SrOnly>
        </Status>
      )}
      {up === false && <Status status="failed">down</Status>}
      {'Ask '}
      <Kbd>Ctrl J</Kbd>
    </Button>
  );
}

/** The header's end: Ask with the assistant's status, help and the glossary. */
function HeaderEnd({ portal, open, turn }: { portal: string | undefined; open: boolean; turn: (open: boolean) => void }) {
  return (
    <Cluster>
      {portal && <AskButton open={open} turn={turn} />}
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
  useRememberPortal(portal);
  useStoreFollowsPortal(portal);
  // All portals shows every section, the portal ones shut (designer T-12)
  const nav = navOf(portal, current, workbench);
  // the model pages follow As of (spec 040 FR-001)
  const model = current === 'processes' || current === 'screens' || current === 'rules';
  return (
    <AssistantContext.Provider value={handle}>
      <AppShell
        nav={nav}
        header={
          <>
            <PortalMenu portal={portal} />
            {portal && model && <AsOfMenu portal={portal} />}
            <SearchBox compact key={searched} value={searched} placeholder="Search" onSearch={(q) => go(searchHref(q, portal))} />
          </>
        }
        headerEnd={<HeaderEnd portal={portal} open={open} turn={turn} />}
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
