/** The BA record tools' inputs (`create_record`, `revise_record`, `withdraw_record`, …). */
import { Confidence } from '@mudpuppy/core';
import { DocKind, EvidenceTargetKind, RelationType } from '@mudpuppy/docs-model';
import { z } from 'zod';

const EvidenceInput = z
  .object({
    target_kind: EvidenceTargetKind,
    target_id: z.string().min(1),
    /** Only on a `state` or `screen_region` link: the run whose observation was read. */
    run_id: z.string().min(1).optional(),
    /** Only on a `screen_region` link: the cited element key (spec 008). */
    region: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export type EvidenceInput = z.infer<typeof EvidenceInput>;

const RelationInput = z.object({ type: RelationType, to_key: z.string().min(1) }).strict();
export type RelationInput = z.infer<typeof RelationInput>;

const Content = z.record(z.string(), z.unknown());

export const CreateRecordInput = z
  .object({
    session_id: z.string().min(1),
    kind: DocKind,
    content: Content,
    confidence: Confidence,
    not_observable: z.boolean().default(false),
    evidence: z.array(EvidenceInput),
    relations: z.array(RelationInput).default([]),
    /** `process` only: the process (PRC-nnn) the record documents; without it one is opened. */
    process_key: z
      .string()
      .regex(/^PRC-\d{3,}$/)
      .optional(),
  })
  .strict();

export const ReviseRecordInput = z
  .object({
    session_id: z.string().min(1),
    key: z.string().min(1),
    base_rev: z.number().int().positive(),
    content: Content,
    confidence: Confidence,
    not_observable: z.boolean().default(false),
    evidence: z.array(EvidenceInput),
    relations: z.array(RelationInput).default([]),
    change_note: z.string().trim().min(1).max(2000),
    responds_to_review: z.string().min(1).optional(),
    /**
     * What this revision leaves out of the previous one on purpose (spec 034 R-70 (3)): evidence
     * links and use-case flow steps it drops must be listed here with a reason, or it is refused.
     */
    dropped: z
      .object({
        reason: z.string().trim().min(1).max(1000),
        evidence: z
          .array(z.object({ target_kind: z.string().min(1), target_id: z.string().min(1) }))
          .optional(),
        steps: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const WithdrawRecordInput = z
  .object({
    session_id: z.string().min(1),
    key: z.string().min(1),
    base_rev: z.number().int().positive(),
    change_note: z.string().trim().min(1).max(2000),
    evidence: z.array(EvidenceInput),
  })
  .strict();

export const AddressCrawlerQuestionInput = z
  .object({
    session_id: z.string().min(1),
    open_question_id: z.string().min(1),
    by_key: z.string().min(1),
  })
  .strict();

export interface WriteOutput {
  key: string;
  rev_no: number;
}
