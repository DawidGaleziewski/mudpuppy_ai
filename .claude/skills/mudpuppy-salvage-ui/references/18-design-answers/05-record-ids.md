# Q5 · Record ids are narrower than our keys (F-06)

**Question.** The Workbench contract's `recordId` is `^(SCR|PROC|BR|CAP|NFR)-[0-9]{3}$`. The documentation also uses REQ, UC,
DI, GL, ASM, OQ, FUP and API, and three or more digits (BR-1001). A RecordCard for REQ-004 or BR-1001 is dropped as
`bad_bind_or_props`. Can the pattern accept every prefix, with `[0-9]{3,}`?

## Decision

Yes. Changed at the source (`workbench/tools/gen_wb_schema.py`) and regenerated:

```
recordId   ^(SCR|PROC|BR|CAP|NFR|REQ|UC|DI|GL|ASM|OQ|FUP|API)-[0-9]{3,}$
ruleId     ^BR-[0-9]{3,}$
changeId   ^CHG-[0-9]{3,}$
findingId  ^FND-[0-9]{3,}$
```

- **A named list, not `[A-Z]{2,5}`.** The card needs to know what a record is to label it, and a list catches typos the
  model makes ("RQ-004"). Adding a record type is one line: `RECORD_PREFIXES` in `gen_wb_schema.py`, then regenerate.
- **The pattern only guards the shape.** The server still resolves every id; a well-formed id that doesn't exist is dropped
  as `id_not_found`, as before.
- **Digits:** three or more, shown as stored (BR-021 and BR-1001; never padded or trimmed).

New examples: `examples/valid/chat-records-long-ids.json` (REQ-004, BR-1001) and `examples/invalid/unknown-record.json`
(`PROC-999` → `id_not_found`). `examples/invalid/EXPECTED.json` lists both.

## How each record type shows

RecordCard and RecordList show every type the same way: the id as a manila tag, the type word, the title, the status and
the revision. Only the type word changes.

| Prefix | Type word | | Prefix | Type word |
|---|---|---|---|---|
| SCR | Screen record | | GL | Glossary term |
| PROC | Process | | ASM | Assumption |
| BR | Business rule | | OQ | Open question |
| CAP | Capability | | FUP | Follow-up |
| NFR | Non-functional requirement | | API | API endpoint |
| REQ | Requirement | | DI | Data item |
| UC | Use case | | | |

```html
<div class="sy-cluster" style="--sy-gap: 6px 10px">
  <a class="sy-tag sy-tag--sm" href="/records/REQ-004">REQ-004</a>
  <span class="sy-label">Requirement</span><b>Premium shown before purchase</b><span class="sy-status" data-status="ok">Confirmed</span>
</div>
```

The tag rule (every record id shown as data is a `.sy-tag`, in its stored case) now names all thirteen prefixes
(`07-requirements.md` FE-V09, the skill's rule 1).

## What to change

- [ ] Take the regenerated `workbench/schema/*.json` (or run `python3 workbench/tools/gen_wb_schema.py`) into
      `packages/workbench-contract`. Don't edit the JSON by hand.
- [ ] Add the type words above to RecordCard / RecordList.
- [ ] Contract tests: `chat-records-long-ids.json` is accepted; `unknown-record.json` logs `id_not_found`.

## Acceptance

- The agent's RecordCard for REQ-004 or BR-1001 renders as a card, not plain chat.
- `RQ-004` (typo) is dropped as `bad_bind_or_props`; `PROC-999` as `id_not_found`.
