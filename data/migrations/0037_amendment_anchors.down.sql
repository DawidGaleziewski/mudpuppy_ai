-- 0037_amendment_anchors (down): amendments lose their typed anchor; the anchor references go.

CREATE TEMP TABLE _anchor_refs AS SELECT ref_id AS id FROM amendments WHERE ref_id IS NOT NULL;
UPDATE amendments SET ref_id = NULL;
DELETE FROM entity_refs WHERE id IN (SELECT id FROM _anchor_refs);
DROP TABLE _anchor_refs;
ALTER TABLE amendments DROP COLUMN ref_id;
