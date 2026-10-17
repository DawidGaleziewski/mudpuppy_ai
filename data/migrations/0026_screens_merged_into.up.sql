-- 0026_screens_merged_into (up): the owner's confirmed "same state" verdict merges one screen into another
-- (spec 033 FR-021, data-model.md "screens.merged_into"). NULL = the screen stands on its own; a value is the
-- id of the screen it was merged into. Clearing the column undoes the merge. No index: no tool spec in
-- contracts/ looks screens up by merged_into, the map reads the whole portal.

ALTER TABLE screens ADD COLUMN merged_into TEXT REFERENCES screens(id)
  CHECK (merged_into IS NULL OR merged_into <> id);
