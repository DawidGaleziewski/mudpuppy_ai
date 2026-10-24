import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Callout, Menu, StoreMark, Text, type MenuEntry } from '../design-system';
import { api, read } from './state/api';

interface StoreOut {
  key: string;
  label: string;
  kind: string;
  workspace: string | null;
  /** The store file ("data/db/sandbox.sqlite") and its size in bytes (designer T-11). */
  path: string;
  size: number | null;
}

interface StoreList {
  current: StoreOut;
  note: string | null;
  stores: StoreOut[];
  /** The store to read this portal in, when the open one lacks it and another holds it. */
  follow?: StoreOut | null;
}

const storesApi = api.injectEndpoints({
  endpoints: (b) => ({
    stores: read<StoreList, string | null>(b, (portal) => `/api/stores${portal ? `?portal=${encodeURIComponent(portal)}` : ''}`, (portal) => ['stores', portal]),
  }),
});

/** The stores to switch to; kept 30 s (the frame reads it on every page). */
const useStores = (portal: string | undefined) => storesApi.useStoresQuery(portal ?? null, { refetchOnMountOrArgChange: 30 });

/** This page's address reading store `key`, its other parameters kept. */
function inStore(pathname: string, search: string, key: string) {
  const p = new URLSearchParams(search);
  p.set('store', key);
  return `${pathname}?${p.toString()}`;
}

/** "22 MB", "4.1 MB", "900 kB": a store file's size for its menu line. */
function sizeWord(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1)} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1e3)))} kB`;
}

/** A store's line in the menu: its file, size and that writes go through commands. */
function storeNote(s: StoreOut): string {
  const parts = [s.path, sizeWord(s.size), s.kind === 'eval' ? `eval workspace ${s.workspace ?? ''}` : 'writes go through commands'];
  return parts.filter(Boolean).join(' · ');
}

/**
 * The store half of the header's portal picker (spec 019 US5, R-71 (d), designer T-11): the
 * store's name; its menu lists the portal's stores (the console reads each one read-only; writes
 * go through commands) and Data store settings. Always a menu, so the header keeps its shape. On
 * All portals each portal has its own store: `per portal`, disabled.
 */
export function StoreMenu({ portal }: { portal: string | undefined }) {
  const { pathname, search } = useLocation();
  const data = useStores(portal).data;
  if (!portal) return <Menu look="store" disabled button="per portal" buttonLabel="Data store: per portal" title="Each portal has its own data store" label="Data store" entries={[]} />;
  if (!data) return <Menu look="store" disabled button={<StoreMark />} buttonLabel="Data store" label="Data store" entries={[]} />;
  const entries: MenuEntry[] = [
    { label: `Stores of ${portal}`, group: true },
    ...data.stores.map((s) => ({ key: s.key, label: s.label, aside: 'read-only', note: storeNote(s), checked: s.key === data.current.key, href: inStore(pathname, search, s.key) })),
    { separator: true },
    { key: 'settings', label: 'Data store settings', href: `/app/portals/${encodeURIComponent(portal)}/settings` },
  ];
  const now = data.current;
  return (
    <Menu
      look="store"
      align="end"
      label="Data store"
      button={
        <>
          <StoreMark />
          {now.label}
        </>
      }
      buttonLabel={`Data store: ${now.label}, read-only`}
      title={`Data store: ${now.path} · read-only · writes go through commands`}
      entries={entries}
    />
  );
}

/**
 * The store follows the portal (R-71 (d), R-103 (3)): arriving at a portal the open store does not
 * hold (from the portal picker or a link), the page is read again in the store that holds it; the
 * history entry is replaced, so Back does not return to the empty one.
 */
export function useStoreFollowsPortal(portal: string | undefined) {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const follow = useStores(portal).data?.follow;
  useEffect(() => {
    if (portal && follow) void navigate(`${inStore(pathname, search, follow.key)}${hash}`, { replace: true });
  }, [portal, follow, pathname, search, hash, navigate]);
}

/** A gone store (the default one shown instead), or the eval workspace being read. */
export function StoreBanner({ portal }: { portal: string | undefined }) {
  const data = useStores(portal).data;
  if (!data) return null;
  if (data.note)
    return (
      <Callout tone="failure" title="Store gone">
        {data.note}
      </Callout>
    );
  if (data.current.kind !== 'eval') return null;
  return (
    <Callout>
      {'Reading the eval workspace '}
      <Text mono>{data.current.workspace ?? ''}</Text>
      {` (${data.current.label}), read-only.`}
    </Callout>
  );
}
