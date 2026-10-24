import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Callout, Disclosure, Row, Rows, Text } from '../design-system';
import { getJson } from './api';

interface StoreOut {
  key: string;
  label: string;
  kind: string;
  workspace: string | null;
}

interface StoreList {
  current: StoreOut;
  note: string | null;
  stores: StoreOut[];
  /** The store to read this portal in, when the open one lacks it and another holds it. */
  follow?: StoreOut | null;
}

const useStores = (portal: string | undefined) =>
  useQuery({
    queryKey: ['stores', portal ?? null],
    queryFn: () => getJson<StoreList>(`/api/stores${portal ? `?portal=${encodeURIComponent(portal)}` : ''}`),
    staleTime: 30_000,
  });

/** This page's address reading store `key`, its other parameters kept. */
function inStore(pathname: string, search: string, key: string) {
  const p = new URLSearchParams(search);
  p.set('store', key);
  return `${pathname}?${p.toString()}`;
}

/**
 * The header's data-store picker (spec 019 US5, R-71 (d)): the store the console reads, and the
 * stores holding the portal's scans (an eval workspace among them). A menu of links.
 */
export function StoreMenu({ portal }: { portal: string | undefined }) {
  const { pathname, search } = useLocation();
  const data = useStores(portal).data;
  if (!data || (data.stores.length < 2 && data.current.kind === 'main')) return null;
  return (
    <Disclosure summary={`Data store: ${data.current.label}`}>
      <Rows label="Switch data store">
        {data.stores.map((s) => (
          <Row key={s.key} current={s.key === data.current.key} aside={s.kind === 'eval' ? <Text small muted>eval workspace</Text> : undefined}>
            <Text href={inStore(pathname, search, s.key)}>{s.label}</Text>
          </Row>
        ))}
      </Rows>
    </Disclosure>
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
