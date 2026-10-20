-- 0036_processes (down): the process tables go, PROC records lose their process, models are
-- variants again.

ALTER TABLE process_model_revisions RENAME TO process_variant_revisions;
ALTER TABLE process_models RENAME TO process_variants;

DROP TRIGGER doc_records_proc_keeps_process;
DROP TRIGGER doc_records_proc_needs_process;
DROP INDEX ux_doc_records_one_proc;
ALTER TABLE doc_records DROP COLUMN process_id;

DROP INDEX ix_process_explorations_process;
DROP TABLE process_explorations;
DROP TABLE process_triggers;
ALTER TABLE ba_processes DROP COLUMN boundary_hypothesis_id;
ALTER TABLE ba_processes DROP COLUMN start_screen_id;
DROP INDEX ux_process_instances_trigger;
DROP INDEX ix_process_instances_process;
DROP TABLE process_instances;
DROP INDEX ix_correlation_ids_journey;
DROP TABLE correlation_ids;
