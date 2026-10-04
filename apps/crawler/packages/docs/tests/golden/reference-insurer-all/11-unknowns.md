# 11. Unknowns

What the documentation does not know: behaviour a crawl cannot observe, statements a person must
confirm, processes cut off at a safety boundary, runs still to do, and evidence that is gone.

## 11.1 Not observable

- [BR-002](06-business-rules.md#BR-002) Purchase issues a policy

## 11.2 Needs confirmation

- [REQ-002](05-functional-requirements.md#REQ-002) Contact form needs a phone or an e-mail
- [BR-002](06-business-rules.md#BR-002) Purchase issues a policy
- [OQ-001](10-assumptions-and-questions.md#OQ-001) Does the make change the calculator?

## 11.3 Process boundaries

- [PROC-002](04-processes-and-use-cases.md#PROC-002) stops at button "Dalej": What follows "Dalej": the next calculator step and the premium.

## 11.4 Follow-up tasks

### <a id="FUP-001"></a>FUP-001 — Trace the contact form

**FUP-001** · rev 1 · draft · needs_confirmation

> DRAFT — not confirmed by a reviewer

What happens after "Wyślij"?

**Suggested run:** trace of process "Send a contact message", goal: See the confirmation as guest

**Reason:** The submit was refused as mutating in the map run.

**Task status:** open

Evidence:

- action `00000000-0000-7000-8000-00000000000b` — button "Wyślij" (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15)

### <a id="FUP-002"></a>FUP-002 — Trace the purchase

**FUP-002** · rev 1 · confirmed · needs_confirmation

What follows "Kup polisę"?

**Suggested run:** trace of process "Buy a car policy", goal: Reach the purchase confirmation as guest

**Reason:** The purchase was refused as mutating.

**Task status:** blocked: ceiling:read: "Dalej" is mutating on production

Evidence:

- decision `00000000-0000-7000-8000-000000000015` — skip ceiling:read: classified mutating, above the effective ceiling read (run `00000000-0000-7000-8000-000000000001`, map, 2026-01-15)

## 11.5 Broken evidence links

Evidence a statement cites whose recorded item no longer exists (for example after a portal data
delete). The statement is kept and flagged for BA attention.

| Record | Rev | Evidence |
| --- | --- | --- |
| [REQ-002](05-functional-requirements.md#REQ-002) | 1 | form `00000000-0000-7000-8000-000000000053` |

## 11.6 Open questions

See [Assumptions and open questions](10-assumptions-and-questions.md): 1 BA question(s), 2 open crawler question(s).
