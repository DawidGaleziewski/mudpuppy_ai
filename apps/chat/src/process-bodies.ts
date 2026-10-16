// Request bodies of the BA process routes (spec 022 M5, contracts/processes-api.md).

import { ChangeSpecSections } from '@pathfinder/chat-model';
import { Environment } from '@pathfinder/config';
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
export const SuggestBody = z.object({
  name: z.string().trim().min(1).max(200),
  persona: z.string().trim().min(1).max(200),
  state_ids: StateIds,
  why: z.string().trim().min(1).max(1_000),
});
