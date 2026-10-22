/** The shapes of the seeded documentation (`seedDocRecords`): a record's revisions and links. */
import type { Confidence } from '@mudpuppy/core';
import type {
  DocContent,
  DocKind,
  EvidenceTargetKind,
  RelationType,
  ReviewAction,
  RevisionChange,
  RevisionStatus,
} from '@mudpuppy/docs-model';
import type { FixtureStore, TraceFixture } from '../fixture-store.js';

export interface LinkSpec {
  kind: EvidenceTargetKind;
  id: string;
  run: string | null;
  note?: string;
}
export interface RevSpec {
  change?: RevisionChange;
  content: DocContent;
  confidence: Confidence;
  notObservable?: boolean;
  status: RevisionStatus;
  note?: string;
  evidence: LinkSpec[];
  relations?: { type: RelationType; to: string }[];
  reviews?: { action: ReviewAction; text?: string }[];
}
/** One record to seed: its kind and its revisions, oldest first. */
export type Seed = [DocKind, RevSpec[]];

/** What the record data reads: the fixture's states, forms, actions and runs. */
export interface SeedContext {
  fx: FixtureStore;
  st: FixtureStore['states'];
  map: string;
  trace: TraceFixture;
  boundary: TraceFixture;
  stateLink: (id: string, note?: string) => LinkSpec;
  confirm: { action: 'confirm' }[];
}
