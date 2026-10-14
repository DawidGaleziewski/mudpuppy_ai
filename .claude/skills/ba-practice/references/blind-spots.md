# Blind spots: say what you could not see

The crawler sees only what a persona sees in the browser, and on production it never submits data.
For each item below that plausibly exists, write `not_observable: true` + `needs_confirmation` + an
`open_question`, or list it in session `gaps`. Never document values you did not see.

- Backend jobs and batch processing (due-date reminders, reservation hand-over after pickup).
- E-mails, SMS, documents sent to the customer.
- Payments and third-party integrations (payment gateways, national registries, credit checks).
- Anything behind a login the persona lacks ("Moje wypożyczenia", account settings): record the login wall
  as observed, the content behind it as not observable.
- Results of actions refused by the safety gate (mutating/destructive/external on production):
  process `observed_extent: until_boundary`.
- Server-side validation never triggered (no bad value was submitted): ask for a trace `followup`.
- Rules not shown in the UI (fee caps, commissions, approval decisions).
- Manual workarounds, back-office steps, tribal knowledge.
- Business goals, stakeholders, why any rule exists.
- Performance, availability and security beyond what was measured in the runs.
