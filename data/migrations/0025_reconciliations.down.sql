-- 0025_reconciliations (down): drop the table and its indexes. All proposals and confirmations are lost.

DROP INDEX ux_reconciliations_open;
DROP INDEX ix_reconciliations_portal_status;
DROP TABLE reconciliations;
