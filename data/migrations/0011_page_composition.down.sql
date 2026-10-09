-- 0011_page_composition (down): forget the recorded page compositions.

ALTER TABLE state_observations DROP COLUMN composition_json;
