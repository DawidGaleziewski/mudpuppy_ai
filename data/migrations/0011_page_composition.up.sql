-- 0011_page_composition (up): how a page was put together (spec 015 R-28, T003).
-- `composition_json` holds a JSON `PageComposition` (frames, micro-frontend mounts, loaders,
-- clickable counts). NULL for observations recorded before this migration.

ALTER TABLE state_observations ADD COLUMN composition_json TEXT CHECK (composition_json IS NULL OR json_valid(composition_json));
