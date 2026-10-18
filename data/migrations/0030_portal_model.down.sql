-- 0030_portal_model (down): back to 0029. The portal model is rebuildable from Layer A, so every model
-- table goes with its rows; nothing in Layer A references them.

DROP INDEX ix_build_epochs_portal;
DROP TABLE build_epochs;
DROP INDEX ux_model_transitions_key;
DROP TABLE model_transitions;
DROP TABLE action_classes;
DROP TABLE parameter_roles;
DROP TABLE state_pair_labels;
DROP INDEX ix_screen_lineage_version;
DROP TABLE screen_lineage;
DROP INDEX ux_screen_members_current;
DROP TABLE screen_members;
DROP INDEX ix_model_screens_portal;
DROP TABLE model_screens;
DROP TABLE model_versions;
