-- 0022_form_steps (up): form steps and state kinds. Spec 032 data-model.md, plan.md decisions 5 and 6.
-- A form step is one step of a (possibly same-URL) form flow on a route template, numbered per
-- (portal, route) in first-seen order. States get a nullable link to their step and a kind
-- (main | validation | technical). No index: no contract query reads by these yet (G-16, house rules).

CREATE TABLE form_steps (
  id             TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  route_template TEXT NOT NULL CHECK (length(route_template) > 0),
  step_index     INTEGER NOT NULL CHECK (step_index >= 1),
  form_name      TEXT,                                               -- the form's accessible name, when it has one
  controls_json  TEXT NOT NULL CHECK (json_valid(controls_json) AND json_type(controls_json) = 'array'),  -- sorted role|name
  label          TEXT NOT NULL CHECK (length(label) > 0),            -- first heading in or above the form, else 'step N'
  first_seen_run TEXT NOT NULL REFERENCES runs(id),
  created_at     TEXT NOT NULL,
  UNIQUE (portal_id, route_template, step_index)
) STRICT;

-- NULL: not a form step (no controls) or recorded before this migration.
ALTER TABLE states ADD COLUMN form_step_id TEXT REFERENCES form_steps(id);
ALTER TABLE states ADD COLUMN state_kind TEXT NOT NULL DEFAULT 'main'
  CHECK (state_kind IN ('main','validation','technical'));
