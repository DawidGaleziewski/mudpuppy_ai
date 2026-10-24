# Findings: spec 074 (R-102)

Owner rule: every bug or slip gets an eval or test idea.

| # | Part | What was wrong | Cause | Test or eval idea |
| - | ---- | -------------- | ----- | ----------------- |
| F-01 | (1) | The Workbench's record cards never showed the record's type word (design answer Q5: "the id as a manila tag, the type word, the title") | `RecordRow.type_word` was a property; `jsonable_encoder` writes a dataclass's fields only, so the JSON never carried it, and R-100's review listed it as dead | Now a field; `test_api_workbench.py` checks the JSON. Idea: a test that every key a web type reads (`api-*.ts`) is in its API's JSON |
| F-02 | (1) | The As of menu offered every model version on a screen, rule or process page, also those before it existed (spec 042 F-09, fixed on htmx) | The React port read `/model-versions` without the item; `as_of.first_seq` looked dead | `/model-versions?kind=&key=`; `test_as_of.py`, `overview.test.tsx` |
| F-03 | (1) | A portal switch kept a store that does not hold the portal (R-71 (d), asked again in R-103 (3)) | R-103's picker kept `?store=`; `stores.store_for_portal` looked dead | `/api/stores` gives `follow`; the frame moves there (replace); `test_stores.py`, `overview.test.tsx` |
| F-05 | (9) | "Ask the assistant to regroup" only opened the drawer; the request was never said | The React port drew it as a `?assistant=open` link; htmx said "Cut this portal into processes and suggest groupings" | A button that asks the drawer (`ask`); `assistant.test.tsx`, `chat-say-browser.e2e.test.ts` |
| F-06 | (9) | A message sent while the assistant was busy came back as an error in the box and was never sent | The drawer showed the 409 as an error; htmx kept it and sent it when the assistant was free | Kept (`keepSay`) with "The assistant is busy. This is sent when it finishes: …"; `chat-say-browser.e2e.test.ts` (busy, then sent) |
| F-07 | (9) | An applied proposal had no Undo (FE-A04, a Must: "shows the applied state with Undo") | Spec 063 listed only apply and discard; the relay refused undo (a test even asserted the 422) | The relay forwards undo and Apply answers `undo`; Review offers Undo; `test_api_review_items.py`, `proposals-browser.e2e.test.ts` (r3 restores r1) |
| F-08 | (9) | The Workbench e2e never ran (3 skipped) | Its seed used an 8-character scan id, refused since full ids (D-9, spec 061), so `beforeAll` failed | Full ids; the three run against `/app/`. Idea: a skipped e2e file fails the close-out |
| F-04 | (1) | "Dead" in a close-out review meant "no caller", which hid three dropped features | A helper without a caller is either dead code or a feature the port forgot | Before deleting a helper, read its old caller and ask what the page did with it (done for every helper here) |
