# 11. Unknowns

What the documentation does not know: behaviour a crawl cannot observe, statements a person must
confirm, processes cut off at a safety boundary, runs still to do, and evidence that is gone.

## 11.1 Not observable

_none_

## 11.2 Needs confirmation

_none_

## 11.3 Process boundaries

_none_

## 11.4 Follow-up tasks

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

_none_

## 11.6 Open questions

See [Assumptions and open questions](10-assumptions-and-questions.md): 0 BA question(s), 2 open crawler question(s).
