# Writing requirements

A **business rule** is a policy ("a book can be picked up within 7 days"). A **requirement** is the
system behaviour that enforces or supports it ("The system shall reject a "Data odbioru" more than 7
days ahead and show "…""). Write both when both are visible; link with `enforces`.

## Statement form

`The system shall <observable behaviour> [when <condition>].` One behaviour per requirement. Quote
labels and messages verbatim. No "should/may/etc." inside the statement; priority is separate and
stays `unset` unless a reviewer sets it.

## Quality attributes (check each before writing)

- **Unambiguous**: one reading. Bad: "The form validates the card number." Good: "The system shall
  reject a "Numer karty" value not matching AA-NNNNNN and show "Nieprawidłowy numer karty"."
- **Complete**: condition, behaviour, and visible outcome.
- **Consistent**: does not contradict another record; if evidence conflicts (two runs differ), write
  both observations and an `open_question`, don't pick one.
- **Verifiable**: a tester can check it from the acceptance criteria alone.
- **Traceable**: evidence cited; rationale separate and labelled (`rationale_confidence`, usually
  `needs_confirmation`).

## Acceptance criteria (Given/When/Then)

```
given: ["the reader is on the \"Odbiór\" step"]
when:  ["they enter \"Data odbioru\" 14 days from today", "they press \"Zarezerwuj\""]
then:  ["the message \"Odbiór możliwy w ciągu 7 dni\" is shown", "the step does not change"]
```

Use only values and outcomes you have evidence for. If the outcome of the `when` was never recorded,
don't write the criterion; raise a `followup` (trace) instead.

## Bad → good

- Bad: "Readers can reserve a book." (vague, and on production the reservation was never observed.)
  Good: requirement "The system shall offer a "Zarezerwuj" button on the book details page",
  observed; plus `process` with `observed_extent: until_boundary`, `not_observable` note and an
  `open_question` about what the reservation does.
