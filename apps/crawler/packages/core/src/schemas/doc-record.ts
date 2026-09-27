import { z } from 'zod';
import { Id, Timestamp } from './common.js';

/** The 12 kinds of Layer B documentation record (data-model.md "Documentation Record"). */
export const DocKind = z.enum([
  'capability',
  'screen',
  'process',
  'use_case',
  'requirement',
  'nfr',
  'business_rule',
  'glossary_term',
  'data_item',
  'assumption',
  'open_question',
  'followup',
]);
export type DocKind = z.infer<typeof DocKind>;

/** `doc_records.key` prefix per kind: `<PREFIX>-<seq 3+ digits>` (data/schema/README.md). */
export const KEY_PREFIX: Record<DocKind, string> = {
  capability: 'CAP',
  screen: 'SCR',
  process: 'PROC',
  use_case: 'UC',
  requirement: 'REQ',
  nfr: 'NFR',
  business_rule: 'BR',
  glossary_term: 'GL',
  data_item: 'DI',
  assumption: 'ASM',
  open_question: 'OQ',
  followup: 'FUP',
};

export const DocRecord = z.object({
  id: Id,
  portal_id: z.string().min(1),
  kind: DocKind,
  key: z.string().min(1),
  seq: z.number().int().positive(),
  title: z.string().min(1),
  latest_rev: z.number().int().positive(),
  confirmed_rev: z.number().int().positive().nullable(),
  withdrawn: z.union([z.literal(0), z.literal(1)]),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type DocRecord = z.infer<typeof DocRecord>;
