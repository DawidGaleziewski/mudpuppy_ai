import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { Callout, Disclosure, Row, Rows, Text } from '../design-system';
import { getJson } from './api';
import { currentAsOf } from './asOf';

interface ModelVersions {
  versions: { seq: number; built_at: string; releases: string[]; scan: string | null }[];
}

const useVersions = (portal: string) =>
  useQuery({
    queryKey: ['portals', portal, 'model-versions'],
    queryFn: () => getJson<ModelVersions>(`/api/portals/${encodeURIComponent(portal)}/model-versions`),
    staleTime: 30_000,
  });

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
  const q = useVersions(portal);
  const versions = q.data?.versions ?? [];
  const chosen = currentAsOf(search);
  if (versions.length < 2) return null;
  const now = versions[0]?.seq;
  return (
    <Disclosure summary={chosen ? `As of version ${chosen}` : 'As of: Now'}>
      <Rows label="Model versions">
        {versions.map((v) => (
          <Row key={v.seq} current={(chosen ?? String(now)) === String(v.seq)} aside={<Text mono small>{v.built_at}</Text>}>
            <Text href={at(pathname, search, v.seq === now ? null : v.seq)}>{v.seq === now ? `Now · version ${String(v.seq)}` : `Version ${String(v.seq)}`}</Text>
            {v.releases.length > 0 && <Text small muted>{` ${v.releases.join(' · ')}`}</Text>}
          </Row>
        ))}
      </Rows>
    </Disclosure>
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
