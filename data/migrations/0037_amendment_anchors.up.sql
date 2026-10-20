-- 0037_amendment_anchors (up, spec 039 design § 15, T074): an amendment's anchor is a typed
-- reference, a model screen and an element key (`entity_refs`). Amendments on a state whose screen
-- is known get their reference now; the rest keep the v1 fingerprint anchor until a person
-- re-anchors them.

ALTER TABLE amendments ADD COLUMN ref_id TEXT REFERENCES entity_refs(id);

INSERT INTO entity_refs (id, screen_id, element_key)
SELECT 'anchor:' || a.id, m.screen_id, json_extract(a.anchor_element, '$.key')
FROM amendments a
JOIN screen_members m ON m.state_id = (
  CASE WHEN instr(a.target_id, '#') > 0 THEN substr(a.target_id, 1, instr(a.target_id, '#') - 1)
       ELSE a.target_id END) AND m.to_model_version IS NULL
WHERE a.target_kind IN ('state', 'wireframe_element');

UPDATE amendments SET ref_id = 'anchor:' || id
WHERE EXISTS (SELECT 1 FROM entity_refs r WHERE r.id = 'anchor:' || amendments.id);
