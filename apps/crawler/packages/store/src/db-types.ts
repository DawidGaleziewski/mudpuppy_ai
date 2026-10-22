/**
 * Kysely table types mirroring data/schema/schema.sql. JSON columns are TEXT (stringified JSON).
 * One file per table family (spec 042 T014); `Database` names every table and view.
 */
import type {
  AmendmentRevisionsTable,
  AmendmentsTable,
  AmendmentTarget,
  BaProcessesTable,
  BaProcessRevisionsTable,
  ChangeSpecRevisionsTable,
  ChatConversationsTable,
  ChatMessagesTable,
  ChatProposalsTable,
  GroupingSuggestionsTable,
  ProcessDraftsTable,
  ProcessLiveTable,
  ProcessModelRevisionsTable,
  ProcessModelsTable,
  ProcessScopesTable,
  WorkflowStepsTable,
} from './db-types-chat.js';
import type {
  CheckpointsTable,
  CredentialsTable,
  FormStepsTable,
  MarksTable,
  ProbeOutcomesTable,
  ProbeSuitesTable,
  RunsTable,
  ScreensTable,
  StatesTable,
  StateWireframesTable,
} from './db-types-crawl.js';
import type {
  AnalysisSessionRunsTable,
  AnalysisSessionsTable,
  DocEvidenceLinksTable,
  DocEvidenceView,
  DocRecordsTable,
  DocRelationsTable,
  DocReviewsTable,
  DocRevisionsTable,
  FollowupTasksTable,
  ProcessesTable,
  ProcessStepsTable,
} from './db-types-docs.js';
import type {
  ActionsTable,
  AttributeWritesTable,
  BuildsTable,
  DecisionLogTable,
  FingerprintProfilesTable,
  FormsTable,
  FrontierTable,
  JourneysTable,
  NetworkCallsTable,
  ObservationBuildsTable,
  ObservationsTable,
  OpenQuestionsTable,
  PortalDataLogTable,
  RobotsPoliciesTable,
  StateComponentsTable,
  StateObservationsTable,
  TransitionsTable,
} from './db-types-evidence.js';
import type {
  ActionClassesTable,
  BuildEpochsTable,
  CorrelationIdsTable,
  DeviationOccurrencesTable,
  DeviationsTable,
  EntityRefsTable,
  HypothesesTable,
  HypothesisEventsTable,
  HypothesisEvidenceTable,
  HypothesisTestsTable,
  HypothesisWordingsTable,
  ModelScreensTable,
  ModelTransitionsTable,
  ModelVersionsTable,
  ParameterRolesTable,
  ProcessExplorationsTable,
  ProcessInstancesTable,
  ProcessTriggersTable,
  ScreenLineageTable,
  ScreenMembersTable,
  SimilarityClassifiersTable,
  StatePairLabelHistoryTable,
  StatePairLabelsTable,
  TauAcceptancesTable,
} from './db-types-model.js';
import type { AgentTurnsTable, TraceBootsTable, TraceSpansTable } from './db-types-trace.js';

export type * from './db-types-chat.js';
export type * from './db-types-crawl.js';
export type * from './db-types-docs.js';
export type * from './db-types-evidence.js';
export type * from './db-types-model.js';
export type * from './db-types-trace.js';

export interface Database {
  runs: RunsTable;
  screens: ScreensTable;
  states: StatesTable;
  state_wireframes: StateWireframesTable;
  state_observations: StateObservationsTable;
  actions: ActionsTable;
  transitions: TransitionsTable;
  forms: FormsTable;
  network_calls: NetworkCallsTable;
  observations: ObservationsTable;
  builds: BuildsTable;
  state_components: StateComponentsTable;
  journeys: JourneysTable;
  attribute_writes: AttributeWritesTable;
  observation_builds: ObservationBuildsTable;
  model_versions: ModelVersionsTable;
  model_screens: ModelScreensTable;
  screen_members: ScreenMembersTable;
  screen_lineage: ScreenLineageTable;
  state_pair_labels: StatePairLabelsTable;
  state_pair_label_history: StatePairLabelHistoryTable;
  parameter_roles: ParameterRolesTable;
  action_classes: ActionClassesTable;
  model_transitions: ModelTransitionsTable;
  build_epochs: BuildEpochsTable;
  entity_refs: EntityRefsTable;
  deviations: DeviationsTable;
  deviation_occurrences: DeviationOccurrencesTable;
  hypotheses: HypothesesTable;
  hypothesis_evidence: HypothesisEvidenceTable;
  hypothesis_tests: HypothesisTestsTable;
  hypothesis_events: HypothesisEventsTable;
  hypothesis_wordings: HypothesisWordingsTable;
  fingerprint_profiles: FingerprintProfilesTable;
  tau_acceptances: TauAcceptancesTable;
  similarity_classifiers: SimilarityClassifiersTable;
  frontier: FrontierTable;
  open_questions: OpenQuestionsTable;
  decision_log: DecisionLogTable;
  robots_policies: RobotsPoliciesTable;
  portal_data_log: PortalDataLogTable;
  trace_boots: TraceBootsTable;
  trace_spans: TraceSpansTable;
  agent_turns: AgentTurnsTable;
  analysis_sessions: AnalysisSessionsTable;
  analysis_session_runs: AnalysisSessionRunsTable;
  doc_records: DocRecordsTable;
  doc_revisions: DocRevisionsTable;
  doc_evidence_links: DocEvidenceLinksTable;
  doc_evidence: DocEvidenceView;
  doc_relations: DocRelationsTable;
  doc_reviews: DocReviewsTable;
  followup_tasks: FollowupTasksTable;
  processes: ProcessesTable;
  process_steps: ProcessStepsTable;
  credentials: CredentialsTable;
  chat_conversations: ChatConversationsTable;
  chat_messages: ChatMessagesTable;
  workflow_steps: WorkflowStepsTable;
  process_scopes: ProcessScopesTable;
  amendments: AmendmentsTable;
  amendment_revisions: AmendmentRevisionsTable;
  /** The views of 0041 (read only): each row with the target it is written on. */
  amendments_with_target: AmendmentsTable & AmendmentTarget;
  amendment_revisions_with_target: AmendmentRevisionsTable & AmendmentTarget;
  chat_proposals: ChatProposalsTable;
  grouping_suggestions: GroupingSuggestionsTable;
  ba_processes: BaProcessesTable;
  ba_process_revisions: BaProcessRevisionsTable;
  process_models: ProcessModelsTable;
  process_model_revisions: ProcessModelRevisionsTable;
  correlation_ids: CorrelationIdsTable;
  process_instances: ProcessInstancesTable;
  process_triggers: ProcessTriggersTable;
  process_explorations: ProcessExplorationsTable;
  process_drafts: ProcessDraftsTable;
  process_live: ProcessLiveTable;
  change_spec_revisions: ChangeSpecRevisionsTable;
  form_steps: FormStepsTable;
  probe_outcomes: ProbeOutcomesTable;
  probe_suites: ProbeSuitesTable;
  marks: MarksTable;
  checkpoints: CheckpointsTable;
}
