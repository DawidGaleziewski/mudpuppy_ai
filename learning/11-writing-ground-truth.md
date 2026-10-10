# 11. Writing ground truth by hand

Module 02 explains *why* you write the ground truth yourself. This module is the *how*, with a
complete example: [examples/claim-portal.ground-truth.yaml](examples/claim-portal.ground-truth.yaml),
a fictional insurer where a logged-in client files a motor claim online. Read it next to this page.

## What you write, and what you don't

You write **BA notes in YAML**: facts about the portal, each with where you got it. You do **not**
write the grader's JSON (`ground-truth.json`). That file is an encoding for the code graders, full
of matching hints, and is produced *from* your notes (today by Claude, later by a converter).

| You write (YAML notes) | The graders read (JSON) |
|---|---|
| Facts in plain words | The same facts plus matching hints |
| `how_i_know` for every item | Nothing about sources |
| `who_sees: guest / client / nobody` | `guest_visible`, `actor`, `reached_by`, `guest_observable` |
| `counts_when`: which record would be correct | `claim_markers` (strings that must appear) |
| Processes as screen ids | Routes, `first_route`, `last_observable_route` |
| `unsure:` for what you couldn't confirm | Nothing: unsure items are left out |

Why YAML: it allows comments, has less punctuation than JSON, and a program can still read it.
Markdown would be nicer to read but has no structure a converter can rely on.

## The parts of an entry

Every item answers four questions:

1. **What is true?** The fact, in the portal's own words for labels (`Data zdarzenia`, not "event
   date"). A BA must keep the portal's terms verbatim, so the ground truth does too.
2. **How do I know?** `how_i_know`. "Tried 29 characters, got an error" is a source; "seems likely"
   is not. No source, no item.
3. **Who can see it?** `who_sees`. A guest trial can't be blamed for missing a client-only screen,
   and a rule nobody can see on the website (R08 in the example) is a **trap**: documenting it means
   the BA made it up (an overclaim).
4. **What counts as correct?** `counts_when`, one sentence. It becomes either a code check (pick the
   strings that must appear) or an LLM judge's question later. Writing it forces you to decide what
   you actually require: in R06, the count and size limits are required, the file types a bonus.

And one optional field: **`unsure:`**. Write down doubts instead of guessing (R09: calendar or
working days?). An unsure item is graded only once you've confirmed it.

## How to go about it

Work on the portal, not in the editor. One process at a time:

1. **Walk the process once as the user would**, without writing. In the example: log in, "Zgłoś
   nową szkodę", four steps, send, the claim page.
2. **Walk it again and write the screens** in order: route, title as shown, who sees it. The
   process falls out of this list: `steps: [S02, S03, S04, S05, S06, S07]`.
3. **On each form, write every field** with its label as shown, type, required or not. Then **try
   the limits**: leave it empty, type too much, enter -1, pick tomorrow's date. Every error message
   you get is a field constraint or a rule, with its source.
4. **Write the rules**: everything that decides what's allowed, what it costs, what appears when.
   Signs of a rule: an error message, a field that appears or disappears (R04, R05), a disabled
   button (F04), a number in help text (R06). One sentence each.
5. **Add what you know but the website doesn't show** (from the business, a manual, a colleague)
   with `who_sees: nobody`. These are your overclaim traps.
6. **Write the terms**: the portal's words a newcomer wouldn't know, with a one-line meaning.
7. **Read it once more against the four questions above.** Drop or mark `unsure:` whatever fails.

Write fewer screens and more rules and processes (module 02, "how to pick"): screens are easy and
already scored well; rules and processes are where the value and the low scores are.

## From your notes to the grader's JSON

Rule R04 from the example:

```yaml
- id: R04
  statement: A theft claim (Kradzież) requires the police report number.
  where: { screen: S03, label: Numer zgłoszenia policji }
  who_sees: client
  how_i_know: with Kradzież and the field empty, "Dalej" shows "Podaj numer zgłoszenia policji"
  counts_when: a record says the police report number is mandatory for theft
```

becomes, in the current schema (`GroundTruth` in `reference-portal/src/ground-truth.ts`):

```json
{
  "id": "R04",
  "statement": "A theft claim (Kradzież) requires the police report number.",
  "type": "validation",
  "anchor": { "screen": "S03", "label": "Numer zgłoszenia policji" },
  "guest_observable": false,
  "claim_markers": ["Kradzież", "policji"]
}
```

- `statement`, `anchor` are copied.
- `guest_observable` comes from `who_sees` (client-only, so false for a guest trial).
- `type` is a category the BA's records use (validation, computation, eligibility…), easy to infer.
- `claim_markers` are picked from `counts_when`: the strings a correct record can't avoid. This is
  the lossy step: a record saying "theft needs the police case number" would fail on "policji". That
  is exactly why module 05 suggests a judge for rules.
- `how_i_know` and `counts_when` are dropped. They are for you and the reviewer, not the grader.

Processes work the same way: `steps` become routes, `first_route` is the first, and
`last_observable_route` is the last step the trial's persona can see.

## What checks your notes

- **Portals we own** (proving ground, reference portal): the consistency test compares the JSON with
  the running portal: routes answer, labels are on the page, rule anchors are where you said.
- **Portals we don't own**: nothing automatic. Your `how_i_know` lines and a second review a few days
  later (module 02) are the check. That's why every item needs a source.

## YAML traps (hit while writing the example)

- A value that **starts with a quote** and continues after it is invalid:
  `how_i_know: "Wyślij" stays disabled` → write `the button "Wyślij" stays disabled`.
- A **`: ` (colon and space) inside a value** starts a new key: `(here: a motor claim)` breaks;
  rephrase or wrap the whole value in quotes.
- A **`?` inside `{ … }`** breaks the inline map: quote it, `label: "Czy byli poszkodowani?"`.
- Check a file with `python3 -c "import yaml; yaml.safe_load(open('file.yaml'))"`.

## Exercises

- [ ] 11.1 Read the example and find, for each of R01–R09, the step in "How to go about it" that
  produced it.
- [ ] 11.2 Convert P01 of the example to the JSON schema by hand (routes, `first_route`,
  `last_observable_route`, `ends_with`).
- [ ] 11.3 Write notes in this format for one process you know from work: 4–8 screens, its fields
  and 5–10 rules, with `how_i_know` for each. Don't look at any agent output first.
