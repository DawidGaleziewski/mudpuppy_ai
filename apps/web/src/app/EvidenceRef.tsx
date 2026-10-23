import { Text } from '../design-system';
import type { Evidence } from './api-scan-tabs';

/** Evidence: a picture the dashboard serves is a link, any other ref its path. */
export function EvidenceRef({ e }: { e: Evidence | null }) {
  if (!e) return <Text muted>—</Text>;
  return e.href ? (
    <Text mono small href={e.href}>
      {e.ref}
    </Text>
  ) : (
    <Text mono small>
      {e.ref}
    </Text>
  );
}
