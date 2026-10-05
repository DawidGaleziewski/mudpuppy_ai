-- 0007_credentials (down): drop the encrypted credentials. Stored secrets are lost; re-add them
-- with `pnpm vault set` after migrating up again.

DROP TABLE credentials;
