-- 0012_page_visits (up): every URL a page was reached under and how (spec 019, R-37/R-38, T003).
-- One row per arrival on a page: the verbatim URL (query, path parameters, fragment, session ids
-- kept) and the ordered hops (HTTP redirects, meta refresh, script, same-document, reload) from the
-- step's start URL to it. `network_calls.url` keeps each API call's verbatim URL beside its template.

CREATE TABLE page_visits (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id),
  state_id   TEXT NOT NULL REFERENCES states(id),
  edge_id    TEXT REFERENCES edges(id),  -- the action edge that led here; NULL for navigate and re-login
  via        TEXT NOT NULL CHECK (via IN ('navigate','action','relogin','login')),
  url        TEXT NOT NULL CHECK (length(url) > 0),
  hops_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(hops_json) AND json_type(hops_json) = 'array'),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_page_visits_run_state ON page_visits (run_id, state_id);
CREATE INDEX idx_page_visits_state ON page_visits (state_id);

ALTER TABLE network_calls ADD COLUMN url TEXT;

-- A BA record may cite a visit ('page_visit', target_id = the visit id): the URL and its parameters
-- are the evidence for a parameter dependency (R-37). A CHECK change needs a table rebuild, as in
-- 0006; nothing references this table.
CREATE TABLE doc_evidence_links_new (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
                 'state','edge','action','form','network_call','rule_candidate','open_question',
                 'decision','process','process_step','doc_record','review','screen_region',
                 'page_visit'
               )),
  target_id   TEXT NOT NULL,
  run_id      TEXT REFERENCES runs(id),
  note        TEXT,
  region      TEXT CHECK (region IS NULL OR length(region) > 0),  -- element key; screen_region only
  CHECK (run_id IS NOT NULL OR target_kind IN ('doc_record','review')),
  CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))
) STRICT;

INSERT INTO doc_evidence_links_new (id, revision_id, target_kind, target_id, run_id, note, region)
SELECT id, revision_id, target_kind, target_id, run_id, note, region
FROM doc_evidence_links;

DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_new RENAME TO doc_evidence_links;

CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);
