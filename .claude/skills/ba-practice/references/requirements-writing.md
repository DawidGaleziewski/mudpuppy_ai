# Writing requirements

A **business rule** is a policy ("drivers must be 18–75"). A **requirement** is the system behaviour
that enforces or supports it ("The system shall reject a "Data urodzenia" that makes the driver
younger than 18 and show "…""). Write both when both are visible; link with `enforces`.

## Statement form

`The system shall <observable behaviour> [when <condition>].` One behaviour per requirement. Quote
labels and messages verbatim. No "should/may/etc." inside the statement; priority is separate and
stays `unset` unless a reviewer sets it.

## Quality attributes (check each before writing)

- **Unambiguous**: one reading. Bad: "The form validates the postcode." Good: "The system shall reject
  a "Kod pocztowy" value not matching NN-NNN and show "Nieprawidłowy kod pocztowy"."
- **Complete**: condition, behaviour, and visible outcome.
- **Consistent**: does not contradict another record; if evidence conflicts (two runs differ), write
  both observations and an `open_question`, don't pick one.
- **Verifiable**: a tester can check it from the acceptance criteria alone.
- **Traceable**: evidence cited; rationale separate and labelled (`rationale_confidence`, usually
  `needs_confirmation`).

## Acceptance criteria (Given/When/Then)

```
given: ["the guest is on the \"Dane kierowcy\" step"]
when:  ["they enter \"Data urodzenia\" 2010-05-01", "they press \"Dalej\""]
then:  ["the message \"Kierowca musi mieć ukończone 18 lat\" is shown", "the step does not change"]
```

Use only values and outcomes you have evidence for. If the outcome of the `when` was never recorded,
don't write the criterion; raise a `followup` (trace) instead.

## Bad → good

- Bad: "Users can buy a policy." (vague, and on production the purchase was never observed.)
  Good: requirement "The system shall offer a "Kup polisę" button on the quote result page", observed;
  plus `process` with `observed_extent: until_boundary`, `not_observable` note and an `open_question`
  about what the purchase does.
