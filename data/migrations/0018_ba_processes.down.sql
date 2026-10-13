-- 0018_ba_processes (down): drop the BA process tables (indexes go with them). Every BA process, variant,
-- revision, draft, live record, change spec and grouping suggestion is lost; process_scopes and the
-- amendments are untouched. The runner turns foreign keys off, so the circular reference between
-- ba_processes and grouping_suggestions drops in any order.

DROP TABLE change_spec_revisions;
DROP TABLE process_live;
DROP TABLE process_drafts;
DROP TABLE process_variant_revisions;
DROP TABLE process_variants;
DROP TABLE ba_process_revisions;
DROP TABLE ba_processes;
DROP TABLE grouping_suggestions;
