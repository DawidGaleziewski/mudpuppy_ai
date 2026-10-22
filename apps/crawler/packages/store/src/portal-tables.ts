/**
 * The tables that hold a portal's gathered data, the order to delete them in, and the clause that
 * picks one portal's rows of each (spec 002 FR-028, data-model.md "Partition map"). Used by the
 * portal export and delete (`portal-data.ts`).
 */

/** Tables that hold a portal's gathered data. `schema_migrations` and `portal_data_log` never do. */
export const PORTAL_TABLES = [
  'runs',
  'states',
  'state_wireframes',
  'state_observations',
  'actions',
  'transitions',
  'forms',
  'network_calls',
  'observations',
  'frontier',
  'open_questions',
  'decision_log',
  'robots_policies',
  'trace_spans',
  'agent_turns',
  'analysis_sessions',
  'analysis_session_runs',
  'doc_records',
  'doc_revisions',
  'doc_evidence_links',
  'doc_relations',
  'doc_reviews',
  'followup_tasks',
  'processes',
  'process_steps',
  'chat_conversations',
  'chat_messages',
  'workflow_steps',
  'process_scopes',
  'amendments',
  'amendment_revisions',
  'chat_proposals',
  'screens',
  'grouping_suggestions',
  'ba_processes',
  'ba_process_revisions',
  'process_models',
  'process_model_revisions',
  'process_drafts',
  'process_live',
  'change_spec_revisions',
  'form_steps',
  'probe_outcomes',
  'probe_suites',
  'marks',
  'checkpoints',
  'builds',
  'state_components',
  'journeys',
  'attribute_writes',
  'observation_builds',
  'model_versions',
  'model_screens',
  'screen_members',
  'screen_lineage',
  'state_pair_labels',
  'state_pair_label_history',
  'parameter_roles',
  'action_classes',
  'model_transitions',
  'build_epochs',
  'entity_refs',
  'deviations',
  'deviation_occurrences',
  'hypotheses',
  'hypothesis_evidence',
  'hypothesis_tests',
  'hypothesis_events',
  'hypothesis_wordings',
  'fingerprint_profiles',
  'tau_acceptances',
  'correlation_ids',
  'process_instances',
  'process_triggers',
  'process_explorations',
  'similarity_classifiers',
] as const;
export type PortalTable = (typeof PORTAL_TABLES)[number];

/**
 * Children before parents, so every foreign key still holds at each step. `process_steps` then
 * `processes` (`0005_trace_processes`) go first of all: steps reference actions, transitions and states,
 * and processes reference runs, actions and doc_records. The chat tables (`0008_chat_orchestrator`)
 * go before even those: amendments reference process_scopes and runs; process_scopes reference
 * states; workflow_steps reference runs and analysis_sessions; all but amendments reference
 * chat_conversations, and chat_messages are its children. `amendment_revisions` (`0016`) precede
 * amendments, and `screens` (`0015`) follow states (states and amendments reference them) and precede
 * runs (`first_seen_run`). The BA process tables (`0018`) go first of all: change specs, live records, drafts,
 * process model revisions and models, process revisions, `ba_processes`, then `grouping_suggestions`; the cycle
 * between `ba_processes.suggestion_id` and `grouping_suggestions.process_id` is cut by clearing the latter first
 * (see `deletePortal`). amendments' self-references
 * (`reapplied_as`, `reapplies`) are within one portal and go in one DELETE statement. Layer B
 * (`0004_ba_documentation`, data-model.md "Portal data partition") goes first: reviews, relations and
 * evidence links are children of doc_revisions; followup_tasks and doc_revisions are children of
 * doc_records; doc_revisions is also a child of analysis_sessions, so it must precede
 * analysis_sessions too. doc_evidence_links and followup_tasks reference runs (nullable), so both must
 * be dropped before `runs`, which they are. `trace_spans` and `agent_turns` come before
 * `decision_log` (spans reference it) and `runs`; `trace_spans`' self-reference (`parent_id`) is
 * cleared first (see `deletePortal`), so its own position in this list only has to precede
 * `decision_log` and `runs`.
 */
export const DELETE_ORDER: readonly PortalTable[] = [
  // 0036 (spec 039): processes' instances, triggers and explorations reference the model, journeys
  // and ba_processes; instances reference correlation ids
  'process_explorations',
  'process_triggers',
  'process_instances',
  'correlation_ids',
  // 0038 (spec 039): no references
  'similarity_classifiers',
  // 0033 (spec 039): no references
  'tau_acceptances',
  'fingerprint_profiles',
  // 0031 (spec 039): interpretation references the model; marks' and open questions' hypothesis
  // links are cleared first (see `deletePortal`)
  'hypothesis_events',
  'hypothesis_wordings', // 0046: references hypotheses
  'hypothesis_tests',
  'hypothesis_evidence',
  'entity_refs',
  'hypotheses',
  'deviation_occurrences',
  'deviations',
  // 0030 (spec 039): the portal model references transitions, observations, builds, states and itself
  'model_transitions',
  'action_classes',
  'screen_lineage',
  'screen_members',
  'build_epochs',
  'model_screens',
  'model_versions',
  'parameter_roles',
  'state_pair_labels',
  'state_pair_label_history', // 0045: references states
  'checkpoints', // 0027: references runs and states (no portal_id: the default run_id partition)
  'marks', // 0024: references runs (used_by_run_id)
  'probe_suites', // 0023: reference runs and form_steps
  'probe_outcomes', // 0023: reference runs, states, form_steps and transitions
  // 0036: PROC records reference ba_processes, so Layer B (and the trace processes that reference
  // it) go before the BA process tables
  'process_steps',
  'processes',
  'doc_reviews',
  'doc_relations',
  'doc_evidence_links',
  'followup_tasks',
  'doc_revisions',
  'doc_records',
  'change_spec_revisions', // 0018: the BA process tables, children first
  'process_live',
  'process_drafts',
  'process_model_revisions',
  'process_models',
  'ba_process_revisions',
  'ba_processes',
  'grouping_suggestions',
  'chat_proposals', // 0017: references chat_conversations and amendments
  'amendment_revisions',
  'amendments',
  'process_scopes',
  'workflow_steps',
  'chat_messages',
  'chat_conversations',
  'analysis_session_runs',
  'analysis_sessions',
  'trace_spans',
  'agent_turns',
  'decision_log',
  'network_calls',
  'observation_builds', // 0029: references observations and builds
  'builds',
  'observations', // 0029: transitions.from_observation_id is cleared first (cycle with observations.transition_id)
  'frontier',
  'actions',
  'transitions',
  'attribute_writes', // 0029: references journeys
  'journeys', // 0029: transitions and observations reference journeys; journeys reference runs, checkpoints
  'forms',
  'open_questions',
  'robots_policies',
  'state_observations',
  'state_wireframes',
  'state_components', // 0029: references states
  'states',
  'form_steps', // 0022: states reference form_steps, form_steps reference runs
  'screens',
  'runs',
];

const DOC_RECORDS_OF_PORTAL = (op: string) => `SELECT id FROM doc_records WHERE portal_id ${op} ?`;
const DOC_REVISIONS_OF_PORTAL = (op: string) =>
  `SELECT id FROM doc_revisions WHERE record_id IN (${DOC_RECORDS_OF_PORTAL(op)})`;

const BA_PROCESSES_OF_PORTAL = (op: string) =>
  `SELECT id FROM ba_processes WHERE portal_id ${op} ?`;

/**
 * A typed reference belongs to the portal of its one target (0031). Each target kind is matched
 * on its own, so the refs go whatever order their referrers are deleted in. The portal is bound
 * once (`?`) and read through `x.p`, like every other clause here.
 */
const ENTITY_REFS_OF_PORTAL = (op: string): string => {
  const runs = `SELECT id FROM runs WHERE portal_id ${op} x.p`;
  const targets = [
    `screen_id IN (SELECT id FROM model_screens WHERE portal_id ${op} x.p)`,
    `state_id IN (SELECT id FROM states WHERE portal_id ${op} x.p)`,
    `observation_id IN (SELECT id FROM observations WHERE run_id IN (${runs}))`,
    `transition_id IN (SELECT id FROM transitions WHERE run_id IN (${runs}))`,
    `network_call_id IN (SELECT id FROM network_calls WHERE run_id IN (${runs}))`,
    `action_class_id IN (SELECT a.id FROM action_classes a JOIN model_screens s ON s.id = a.screen_id WHERE s.portal_id ${op} x.p)`,
    `model_transition_id IN (SELECT t.id FROM model_transitions t JOIN model_screens s ON s.id = t.from_screen_id WHERE s.portal_id ${op} x.p)`,
    `hypothesis_id IN (SELECT id FROM hypotheses WHERE portal_id ${op} x.p)`,
    `process_id IN (SELECT id FROM ba_processes WHERE portal_id ${op} x.p)`,
  ];
  return `EXISTS (SELECT 1 FROM (SELECT ? AS p) x WHERE ${targets.join(' OR ')})`;
};

type Clause = (op: string) => string;

/** `column IN (SELECT id FROM parent WHERE portal_id <op> ?)`: a table owned through a parent. */
const through =
  (column: string, parent: string): Clause =>
  (op) =>
    `${column} IN (SELECT id FROM ${parent} WHERE portal_id ${op} ?)`;
const ownColumn: Clause = (op) => `portal_id ${op} ?`;
const ofJourneys: Clause = (op) =>
  `journey_id IN (SELECT id FROM journeys WHERE run_id IN (SELECT id FROM runs WHERE portal_id ${op} ?))`;
const ofProcesses: Clause = (op) => `process_id IN (${BA_PROCESSES_OF_PORTAL(op)})`;
const ofRevisions: Clause = (op) => `revision_id IN (${DOC_REVISIONS_OF_PORTAL(op)})`;
const ofRecords: Clause = (op) => `record_id IN (${DOC_RECORDS_OF_PORTAL(op)})`;
const ofRuns: Clause = through('run_id', 'runs');

/** Tables with their own `portal_id` column. */
const OWN_PORTAL_ID: readonly PortalTable[] = [
  'runs',
  'states',
  'analysis_sessions',
  'doc_records',
  'processes',
  'chat_conversations',
  'workflow_steps',
  'process_scopes',
  'amendments',
  'chat_proposals',
  'screens',
  'ba_processes',
  'grouping_suggestions',
  'form_steps',
  'probe_suites',
  'marks',
  'builds',
  'model_versions',
  'model_screens',
  'state_pair_labels',
  'state_pair_label_history',
  'parameter_roles',
  'build_epochs',
  'deviations',
  'hypotheses',
  'fingerprint_profiles',
  'tau_acceptances',
  'similarity_classifiers',
];

/** How each table reaches its portal; a table not listed hangs on a run (`run_id`). */
const PORTAL_CLAUSE: Partial<Record<PortalTable, Clause>> = {
  ...Object.fromEntries(OWN_PORTAL_ID.map((t) => [t, ownColumn])),
  deviation_occurrences: through('deviation_id', 'deviations'),
  hypothesis_evidence: through('hypothesis_id', 'hypotheses'),
  hypothesis_tests: through('hypothesis_id', 'hypotheses'),
  hypothesis_events: through('hypothesis_id', 'hypotheses'),
  hypothesis_wordings: through('hypothesis_id', 'hypotheses'),
  entity_refs: ENTITY_REFS_OF_PORTAL,
  screen_members: through('screen_id', 'model_screens'),
  action_classes: through('screen_id', 'model_screens'),
  model_transitions: through('from_screen_id', 'model_screens'),
  screen_lineage: through('model_version_id', 'model_versions'),
  state_components: through('state_id', 'states'),
  attribute_writes: ofJourneys,
  observation_builds: (op) =>
    `observation_id IN (SELECT id FROM observations WHERE run_id IN (SELECT id FROM runs WHERE portal_id ${op} ?))`,
  chat_messages: through('conversation_id', 'chat_conversations'),
  analysis_session_runs: through('session_id', 'analysis_sessions'),
  doc_revisions: ofRecords,
  doc_evidence_links: ofRevisions,
  doc_reviews: ofRevisions,
  doc_relations: (op) => `from_revision_id IN (${DOC_REVISIONS_OF_PORTAL(op)})`,
  followup_tasks: ofRecords,
  amendment_revisions: through('amendment_id', 'amendments'),
  correlation_ids: ofJourneys,
  ba_process_revisions: ofProcesses,
  process_models: ofProcesses,
  process_instances: ofProcesses,
  process_triggers: ofProcesses,
  process_explorations: ofProcesses,
  process_live: ofProcesses,
  change_spec_revisions: ofProcesses,
  process_model_revisions: (op) =>
    `model_id IN (SELECT id FROM process_models WHERE process_id IN (${BA_PROCESSES_OF_PORTAL(op)}))`,
  process_drafts: (op) =>
    `model_id IN (SELECT id FROM process_models WHERE process_id IN (${BA_PROCESSES_OF_PORTAL(op)}))`,
  process_steps: through('process_id', 'processes'),
  state_wireframes: through('state_id', 'states'),
};

/** `mine`: rows of the portal; `others`: rows of every other portal. */
export function where(table: PortalTable, side: 'mine' | 'others'): string {
  return (PORTAL_CLAUSE[table] ?? ofRuns)(side === 'mine' ? '=' : '<>');
}
