-- 0023_probe_outcomes_and_suites (down): drop both tables and their indexes. All probe outcomes and suites are lost.

DROP INDEX ix_probe_suites_portal_status;
DROP TABLE probe_suites;
DROP INDEX ix_probe_outcomes_form_step;
DROP INDEX ix_probe_outcomes_run;
DROP TABLE probe_outcomes;
