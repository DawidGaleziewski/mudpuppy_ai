-- 0033_fingerprint_profiles (down): back to 0032; profiles and accepted τ go with their rows.

DROP INDEX ix_tau_acceptances_portal;
DROP TABLE tau_acceptances;
ALTER TABLE model_versions DROP COLUMN fingerprint_profile;
ALTER TABLE state_components DROP COLUMN profile;
ALTER TABLE observations DROP COLUMN fingerprint_profile;
DROP TABLE fingerprint_profiles;
