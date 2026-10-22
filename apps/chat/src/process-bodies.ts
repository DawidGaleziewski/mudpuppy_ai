// Request bodies of the BA process routes (spec 022 M5, contracts/processes-api.md).

import { ChangeSpecSections } from '@mudpuppy/chat-model';
import { Environment } from '@mudpuppy/config';
import { z } from 'zod';
import { Steps } from './process-steps.js';

const Author = z.string().trim().min(1).max(200).default('BA');
const Rev = z.number().int().min(1);
export const Label = z.string().regex(/^[A-Z]{1,2}$/);
const Stage = z.enum(['scoped', 'as_is_documented', 'to_be_design', 'migrating', 'migrated']);
const StateIds = z.array(z.string().min(1)).min(1).max(200);

export const CreateProcessBody = z.object({
  name: z.string().trim().min(1).max(200),
  persona: z.string().trim().min(1).max(200),
  state_ids: StateIds,
  author: Author,
});

export const ProcessChangeBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    stage: Stage.optional(),
    base_rev: Rev,
    author: Author,
  })
  .refine((b) => b.name !== undefined || b.stage !== undefined, 'Give a new name or stage.');

/** Archive or restore a process (spec 027 US4): one process revision, nothing deleted. */
export const ArchiveBody = z.object({ base_rev: Rev, author: Author });

/** A person's edit of the as-is (spec 027 FR-004): A's screens in their new order. */
export const EditAsIsBody = z.object({
  base_rev: Rev,
  state_ids: StateIds,
  note: z.string().trim().max(500).optional(),
  author: Author,
});

/** "Open in Processes" from a BA process record (spec 027 US6.2). */
export const FromRecordBody = z.object({
  record_key: z.string().regex(/^PROC-\d{3,}$/),
  author: Author,
});

export const BranchBody = z.object({
  from: Label.default('A'),
  from_rev: Rev.optional(),
  author: Author,
});
export const DraftBody = z.object({ base_rev: Rev, steps: Steps, author: Author });
export const AuthorBody = z.object({ author: Author });
export const SaveBody = z.object({
  base_rev: Rev,
  note: z.string().trim().max(500).optional(),
  author: Author,
});
export const RestoreBody = z.object({ rev: Rev, base_rev: Rev, author: Author });

export const LiveBody = z.object({
  environment: Environment,
  label: Label,
  rev: Rev.optional(),
  reason: z.string().trim().max(500).optional(),
  author: Author,
});

export const ChangeSpecBody = z.object({
  base_rev: Rev.optional(),
  left: z.object({ label: Label, rev: Rev }),
  right: z.object({ label: Label, rev: Rev }),
  sections: ChangeSpecSections,
  author: Author,
});

export const AcceptBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  author: Author,
});
/** Split a suggestion before its step `at` (1-based: the first step of the second part). */
export const SplitBody = z.object({ author: Author, at: z.coerce.number().int().min(2) });
/** Merge a suggestion with another open one; the other's steps follow. */
export const MergeBody = z.object({ author: Author, with: z.string().min(1).max(100) });
export const SuggestBody = z.object({
  name: z.string().trim().min(1).max(200),
  persona: z.string().trim().min(1).max(200),
  state_ids: StateIds,
  why: z.string().trim().min(1).max(1_000),
});
