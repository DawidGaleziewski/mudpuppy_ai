import { z } from 'zod';
import { Id } from '@mudpuppy/core';

/** (from kind, type, to kind) triples allowed for each value live in `@mudpuppy/docs` (tasks.md T009). */
export const RelationType = z.enum([
  'contains',
  'describes',
  'refines',
  'enforces',
  'appears_on',
  'uses_term',
  'synonym_of',
  'answers',
  'depends_on',
  // spec 019 F-14 (owner, 2026-10-12): what the BA kept trying to say (F-12)
  'applies_on',
  'asks_about',
  'follows_up',
]);
export type RelationType = z.infer<typeof RelationType>;

/** Relations are versioned with the revision that asserts them. */
export const DocRelation = z.object({
  from_revision_id: Id,
  to_record_id: Id,
  type: RelationType,
});
export type DocRelation = z.infer<typeof DocRelation>;
