# Record kinds

Authoritative shapes: `specs/004-ba-documentation/data-model.md` → "Content per kind" (Zod enforces
them; `SCHEMA_INVALID` names the bad field). Every kind has `title` (English) and optional `summary`.
Portal-language text goes in `*_verbatim` fields with a `lang` code (e.g. `pl`).

| Kind (key) | Required content | Typical evidence | Good title |
|---|---|---|---|
| `capability` (CAP) | `description` | nav states, screens | "Car insurance quoting" |
| `screen` (SCR) | `purpose`, `route_templates[]` (exactly as recorded, e.g. `/kalkulator/pojazd`), `elements[]` `{role, label_verbatim}`, `entry_points[]` | states, edges | "Vehicle details step" |
| `process` (PROC) | `goal`, `persona`, `trigger`, `outcome`, `observed_extent` (`full`, `until_boundary`, `map_only`) | trace process, steps | "Calculate an OC/AC premium" |
| `use_case` (UC) | `primary_actor`, `preconditions[]`, `trigger`, `main_flow[]` `{n, actor_or_system, text}`, `alternate_flows[]`, `exception_flows[]`, `postconditions[]` | process steps | "Guest calculates a car premium" |
| `requirement` (REQ) | `statement`, `rationale?` + `rationale_confidence`, `acceptance_criteria[]` `{given[], when[], then[]}`, `priority` (`unset` unless a reviewer said) | forms, edges, steps | "Reject invalid postcode" |
| `nfr` (NFR) | `category` (`performance`, `security`, `accessibility`, `availability`, `compliance`, `usability`, `localisation`), `statement`, `measured?` `{value, unit, how}`, all three strings (`value: "200"`, not `200`) | network calls, robots, states | "Pages served in Polish" |
| `business_rule` (BR) | `statement`, `rule_type` (`constraint`, `computation`, `inference`, `action_enabler`), `decision_table?` | forms, states, validation messages, screen regions of the controls | "Driver age limits" |
| `glossary_term` (GL) | `term_verbatim`, `lang`, `definition` (English), `synonyms_verbatim[]` | states where the term appears | "Bezszkodowa jazda" |
| `data_item` (DI) | `name_verbatim` (= field label exactly), `lang`, `name_en`, `data_type`, `constraints` `{required?, format?, min_length?, max_length?, allowed_values[]?, pattern_observed?}`, `seen_in[]` `{kind, target_id}` with `kind` `form`, `network_call` or `page_visit` (a URL parameter) and `target_id` that form's, call's or visit's id | form, network call, page visit, screen region of the field | "Kod pocztowy" |
| `assumption` (ASM) | `statement`, `impact_if_wrong` | records, reviews | "Premium shown is final" |
| `open_question` (OQ) | `question`, `why_it_matters`, `answer_needed_from` (`sme`, `crawler`, `either`) | anything unexplained | — |
| `followup` (FUP) | `question`, `suggested_mode` (`map`, `trace`), `target` (`{url}` or `{process_name, goal}`), `persona`, `reason` | the state with the entry point | — |

## Relations (from → type → to)

- `capability` contains `process` | `screen`
- `use_case` describes `process`
- `requirement` refines `use_case` | `capability`
- `requirement` enforces `business_rule`
- `data_item` appears_on `screen`
- any kind uses_term `glossary_term`
- `glossary_term` synonym_of `glossary_term`
- `assumption` | `requirement` | `business_rule` answers `open_question`
- depends_on between two records of the same kind (e.g. process → process)
- `business_rule` applies_on `screen` (the screen where the rule holds)
- `open_question` asks_about any record (what the question is about; the answer later uses `answers`)
- `followup` follows_up `process` | `capability` | `screen` | `business_rule` | `open_question` | `use_case` (what the follow-up would observe or answer)

## Constraints in `data_item`

Record only what evidence shows: HTML `required` → `required: true`; `pattern`/`maxlength`/`min`/`max`
attributes; a validation message after a bad value (from a trace) → `pattern_observed` plus the
message verbatim in a linked rule. `min`/`max` for numbers go in `allowed_values` only when listed;
otherwise state them in the rule and keep `format` descriptive (`"NN-NNN"`).
