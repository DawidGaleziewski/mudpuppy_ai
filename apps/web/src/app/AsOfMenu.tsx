import { useLocation } from 'react-router';
import { Callout, HeaderPicker, Menu, Text, type MenuEntry } from '../design-system';
import { currentAsOf } from './asOf';
import { api, read } from './state/api';

interface ModelVersions {
  versions: { seq: number; built_at: string; releases: string[]; scan: string | null }[];
}

/** One screen, rule or process page: its kind and key (a list or the map: none). */
const ITEM = /^\/app\/portals\/[^/]+\/(screens|rules|processes)\/([^/]+)/;
const KIND = { screens: 'screen', rules: 'rule', processes: 'process' } as const;
const NOT_ITEMS = new Set(['map', 'recorded', 'access']);

function itemOf(pathname: string): { kind: string; key: string } | null {
  const m = ITEM.exec(pathname);
  if (!m || NOT_ITEMS.has(m[2] ?? '')) return null;
  return { kind: KIND[m[1] as keyof typeof KIND], key: decodeURIComponent(m[2] ?? '') };
}

type VersionsArg = { portal: string; item: { kind: string; key: string } | null };

const versionsApi = api.injectEndpoints({
  endpoints: (b) => ({
    modelVersions: read<ModelVersions, VersionsArg>(
      b,
      ({ portal, item }) => `/api/portals/${encodeURIComponent(portal)}/model-versions${item ? `?${new URLSearchParams(item).toString()}` : ''}`,
      ({ portal, item }) => ['portals', portal, 'model-versions', item],
    ),
  }),
});

/** The versions; on one screen, rule or process only those it is in (spec 042 F-09); kept 30 s. */
const useVersions = (portal: string, item: VersionsArg['item']) =>
  versionsApi.useModelVersionsQuery({ portal, item }, { refetchOnMountOrArgChange: 30 });

/**
 * This page's address at version `seq` (null: Now), its other parameters kept. Now is written out
 * (`as_of=now`): links between model pages keep a chosen version, so going back must say so.
 */
function at(pathname: string, search: string, seq: number | null) {
  const p = new URLSearchParams(search);
  p.set('as_of', seq === null ? 'now' : String(seq));
  const q = p.toString();
  return `${pathname}${q ? `?${q}` : ''}`;
}

/**
 * The As of menu on a model page (spec 040 FR-001, designer 12-v2-ux § 2): Now, or a past model
 * version with the releases it brought. A menu of links, never a select that navigates.
 */
export function AsOfMenu({ portal }: { portal: string }) {
  const { pathname, search } = useLocation();
  const q = useVersions(portal, itemOf(pathname));
  const versions = q.data?.versions ?? [];
  const chosen = currentAsOf(search);
  if (versions.length < 2) return null;
  const now = versions[0]?.seq;
  const entries: MenuEntry[] = versions.map((v) => ({
    key: String(v.seq),
    label: v.seq === now ? `Now · version ${String(v.seq)}` : `Version ${String(v.seq)}`,
    aside: v.built_at,
    note: v.releases.length > 0 ? v.releases.join(' · ') : undefined,
    checked: (chosen ?? String(now)) === String(v.seq),
    href: at(pathname, search, v.seq === now ? null : v.seq),
  }));
  const word = chosen ? `Version ${chosen}` : 'Now';
  return (
    <HeaderPicker label="As of">
      <Menu look="select" label="Model versions" button={word} buttonLabel={`As of: ${word}`} entries={entries} />
    </HeaderPicker>
  );
}

/** While a past version is shown: which one, that changes still go to now, and the way back. */
export function AsOfBanner() {
  const { pathname, search } = useLocation();
  const chosen = currentAsOf(search);
  if (!chosen) return null;
  return (
    <Callout title={`As of model version ${chosen}`}>
      {'These pages show the portal model as it was when that version was built; anything you change goes to now. '}
      <Text href={at(pathname, search, null)}>Back to now</Text>
    </Callout>
  );
}
