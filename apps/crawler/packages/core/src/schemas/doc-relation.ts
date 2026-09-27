import { z } from 'zod';
import { Id } from './common.js';

/** (from kind, type, to kind) triples allowed for each value live in `@pathfinder/docs` (tasks.md T009). */
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
]);
export type RelationType = z.infer<typeof RelationType>;

/** Relations are versioned with the revision that asserts them. */
export const DocRelation = z.object({
  from_revision_id: Id,
  to_record_id: Id,
  type: RelationType,
});
export type DocRelation = z.infer<typeof DocRelation>;
