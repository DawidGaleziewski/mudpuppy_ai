import { z } from 'zod';
import { Confidence, Id } from './common.js';
import { DocKind } from './doc-record.js';

/**
 * Kind-specific content stored in `doc_revisions.content_json` (data-model.md "Content per kind").
 * Every kind carries `title` (English) and an optional `summary`; portal-language strings live in
 * `*_verbatim` fields with a `lang` code (D6). This is the write contract: the Zod schema wins over
 * the table if the two ever diverge (Principle II).
 */
const base = { title: z.string().min(1), summary: z.string().min(1).optional() };

export const CapabilityContent = z.object({
  kind: z.literal('capability'),
  ...base,
  description: z.string().min(1),
});
export type CapabilityContent = z.infer<typeof CapabilityContent>;

export const ScreenElement = z.object({
  role: z.string().min(1),
  label_verbatim: z.string().min(1),
});
export type ScreenElement = z.infer<typeof ScreenElement>;

export const ScreenContent = z.object({
  kind: z.literal('screen'),
  ...base,
  purpose: z.string().min(1),
  route_templates: z.array(z.string().min(1)).min(1),
  elements: z.array(ScreenElement),
  entry_points: z.array(z.string().min(1)),
});
export type ScreenContent = z.infer<typeof ScreenContent>;

/** `full`: goal reached; `until_boundary`: stopped at a safety gate; `map_only`: never traced. */
export const ProcessObservedExtent = z.enum(['full', 'until_boundary', 'map_only']);
export type ProcessObservedExtent = z.infer<typeof ProcessObservedExtent>;

export const ProcessContent = z.object({
  kind: z.literal('process'),
  ...base,
  goal: z.string().min(1),
  persona: z.string().min(1),
  trigger: z.string().min(1),
  outcome: z.string().min(1),
  observed_extent: ProcessObservedExtent,
});
export type ProcessContent = z.infer<typeof ProcessContent>;

export const UseCaseFlowStep = z.object({
  n: z.number().int().positive(),
  actor_or_system: z.string().min(1),
  text: z.string().min(1),
});
export type UseCaseFlowStep = z.infer<typeof UseCaseFlowStep>;

export const UseCaseContent = z.object({
  kind: z.literal('use_case'),
  ...base,
  primary_actor: z.string().min(1),
  preconditions: z.array(z.string().min(1)),
  trigger: z.string().min(1),
  main_flow: z.array(UseCaseFlowStep).min(1),
  // Assumption (undocumented shape in data-model.md): alternate/exception flows are step lists of the
  // same shape as main_flow, one array per branch.
  alternate_flows: z.array(z.array(UseCaseFlowStep)),
  exception_flows: z.array(z.array(UseCaseFlowStep)),
  postconditions: z.array(z.string().min(1)),
});
export type UseCaseContent = z.infer<typeof UseCaseContent>;

export const AcceptanceCriterion = z.object({
  given: z.array(z.string().min(1)),
  when: z.array(z.string().min(1)),
  then: z.array(z.string().min(1)),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterion>;

export const RequirementPriority = z.enum(['must', 'should', 'could', 'wont', 'unset']);
export type RequirementPriority = z.infer<typeof RequirementPriority>;

export const RequirementContent = z.object({
  kind: z.literal('requirement'),
  ...base,
  statement: z.string().min(1),
  rationale: z.string().min(1).optional(),
  // Assumption: accompanies `rationale` when present ("rationale? (+ rationale_confidence)").
  rationale_confidence: Confidence.optional(),
  acceptance_criteria: z.array(AcceptanceCriterion),
  priority: RequirementPriority,
});
export type RequirementContent = z.infer<typeof RequirementContent>;

export const NfrCategory = z.enum([
  'performance',
  'security',
  'accessibility',
  'availability',
  'compliance',
  'usability',
  'localisation',
]);
export type NfrCategory = z.infer<typeof NfrCategory>;

export const NfrMeasured = z.object({
  value: z.string().min(1),
  unit: z.string().min(1),
  how: z.string().min(1),
});
export type NfrMeasured = z.infer<typeof NfrMeasured>;

export const NfrContent = z.object({
  kind: z.literal('nfr'),
  ...base,
  category: NfrCategory,
  statement: z.string().min(1),
  measured: NfrMeasured.optional(),
});
export type NfrContent = z.infer<typeof NfrContent>;

export const BusinessRuleType = z.enum(['constraint', 'computation', 'inference', 'action_enabler']);
export type BusinessRuleType = z.infer<typeof BusinessRuleType>;

export const DecisionTable = z.object({
  conditions: z.array(z.string().min(1)),
  actions: z.array(z.string().min(1)),
  // Assumption: one row per rule, one cell per condition then per action, in that column order.
  rows: z.array(z.array(z.string())),
});
export type DecisionTable = z.infer<typeof DecisionTable>;

export const BusinessRuleContent = z.object({
  kind: z.literal('business_rule'),
  ...base,
  statement: z.string().min(1),
  rule_type: BusinessRuleType,
  decision_table: DecisionTable.optional(),
});
export type BusinessRuleContent = z.infer<typeof BusinessRuleContent>;

export const GlossaryTermContent = z.object({
  kind: z.literal('glossary_term'),
  ...base,
  term_verbatim: z.string().min(1),
  lang: z.string().min(2),
  definition: z.string().min(1),
  synonyms_verbatim: z.array(z.string().min(1)),
});
export type GlossaryTermContent = z.infer<typeof GlossaryTermContent>;

export const DataItemConstraints = z.object({
  required: z.boolean().optional(),
  format: z.string().min(1).optional(),
  min_length: z.number().int().nonnegative().optional(),
  max_length: z.number().int().nonnegative().optional(),
  allowed_values: z.array(z.string()).optional(),
  pattern_observed: z.string().min(1).optional(),
});
export type DataItemConstraints = z.infer<typeof DataItemConstraints>;

/** Assumption: where the field was seen, resolved like an evidence target (`form` or `network_call` id). */
export const DataItemSighting = z.object({
  kind: z.enum(['form', 'network_call']),
  target_id: Id,
});
export type DataItemSighting = z.infer<typeof DataItemSighting>;

export const DataItemContent = z.object({
  kind: z.literal('data_item'),
  ...base,
  name_verbatim: z.string().min(1),
  lang: z.string().min(2),
  name_en: z.string().min(1),
  data_type: z.string().min(1),
  constraints: DataItemConstraints,
  seen_in: z.array(DataItemSighting),
});
export type DataItemContent = z.infer<typeof DataItemContent>;

export const AssumptionContent = z.object({
  kind: z.literal('assumption'),
  ...base,
  statement: z.string().min(1),
  impact_if_wrong: z.string().min(1),
});
export type AssumptionContent = z.infer<typeof AssumptionContent>;

export const OpenQuestionAnswerNeededFrom = z.enum(['sme', 'crawler', 'either']);
export type OpenQuestionAnswerNeededFrom = z.infer<typeof OpenQuestionAnswerNeededFrom>;

export const OpenQuestionContent = z.object({
  kind: z.literal('open_question'),
  ...base,
  question: z.string().min(1),
  why_it_matters: z.string().min(1),
  answer_needed_from: OpenQuestionAnswerNeededFrom,
});
export type OpenQuestionContent = z.infer<typeof OpenQuestionContent>;

export const FollowupSuggestedMode = z.enum(['map', 'trace']);
export type FollowupSuggestedMode = z.infer<typeof FollowupSuggestedMode>;

export const FollowupTarget = z.union([
  z.object({ url: z.string().min(1).optional() }),
  z.object({ process_name: z.string().min(1), goal: z.string().min(1) }),
]);
export type FollowupTarget = z.infer<typeof FollowupTarget>;

export const FollowupContent = z.object({
  kind: z.literal('followup'),
  ...base,
  question: z.string().min(1),
  suggested_mode: FollowupSuggestedMode,
  target: FollowupTarget,
  persona: z.string().min(1),
  reason: z.string().min(1),
});
export type FollowupContent = z.infer<typeof FollowupContent>;

/** Discriminated union on `kind`, matching `DocKind` 1:1. */
export const DocContent = z.discriminatedUnion('kind', [
  CapabilityContent,
  ScreenContent,
  ProcessContent,
  UseCaseContent,
  RequirementContent,
  NfrContent,
  BusinessRuleContent,
  GlossaryTermContent,
  DataItemContent,
  AssumptionContent,
  OpenQuestionContent,
  FollowupContent,
]);
export type DocContent = z.infer<typeof DocContent>;

/** Per-kind schema lookup, e.g. `DOC_CONTENT_BY_KIND.requirement.parse(...)`. */
export const DOC_CONTENT_BY_KIND = {
  capability: CapabilityContent,
  screen: ScreenContent,
  process: ProcessContent,
  use_case: UseCaseContent,
  requirement: RequirementContent,
  nfr: NfrContent,
  business_rule: BusinessRuleContent,
  glossary_term: GlossaryTermContent,
  data_item: DataItemContent,
  assumption: AssumptionContent,
  open_question: OpenQuestionContent,
  followup: FollowupContent,
} satisfies Record<DocKind, z.ZodTypeAny>;
