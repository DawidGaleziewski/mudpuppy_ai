-- 0006_screenshots_wireframes (up): screenshots, element layouts and wireframes per state, and
-- screen-region evidence for the BA (spec 008, R-20 + R-21). Conventions: see data/schema/README.md.
-- Zod schemas in @pathfinder/core (layout.ts, schemas/evidence-link.ts) are the write contract.

-- Captured once, when the state is first recorded. NULL when capture failed or the state predates
-- 0006 (no backfill). Both are evidence refs: '<sha256>.png' and a Layout '<sha256>.json'.
ALTER TABLE states ADD COLUMN screenshot_ref TEXT CHECK (screenshot_ref IS NULL OR length(screenshot_ref) > 0);
ALTER TABLE states ADD COLUMN layout_ref     TEXT CHECK (layout_ref IS NULL OR length(layout_ref) > 0);

-- Derived wireframes: rebuilt from the state's ARIA snapshot by @pathfinder/wireframe whenever
-- generator_version is stale. Never cited as evidence.
CREATE TABLE state_wireframes (
  state_id          TEXT PRIMARY KEY REFERENCES states(id),
  generator_version TEXT NOT NULL CHECK (length(generator_version) > 0),
  svg_ref           TEXT NOT NULL CHECK (length(svg_ref) > 0),
  excalidraw_ref    TEXT NOT NULL CHECK (length(excalidraw_ref) > 0),
  created_at        TEXT NOT NULL
) STRICT;

-- doc_evidence_links gains the 'screen_region' kind (target_id = state id) and its element key.
-- A CHECK change needs a table rebuild; nothing references this table.
CREATE TABLE doc_evidence_links_new (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
                 'state','edge','action','form','network_call','rule_candidate','open_question',
                 'decision','process','process_step','doc_record','review','screen_region'
               )),
  target_id   TEXT NOT NULL,
  run_id      TEXT REFERENCES runs(id),
  note        TEXT,
  region      TEXT CHECK (region IS NULL OR length(region) > 0),  -- element key; screen_region only
  CHECK (run_id IS NOT NULL OR target_kind IN ('doc_record','review')),
  CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))
) STRICT;

INSERT INTO doc_evidence_links_new (id, revision_id, target_kind, target_id, run_id, note, region)
SELECT id, revision_id, target_kind, target_id, run_id, note, NULL
FROM doc_evidence_links;

DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_new RENAME TO doc_evidence_links;

CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);
