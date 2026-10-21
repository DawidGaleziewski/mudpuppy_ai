# Spec 039 (R-81) — owner answers 2026-10-21

The answers to the questions in `2026-10-20-spec039-evening.md` and `ux-gaps.md` § 3, numbered as in
the list printed on 2026-10-21. The owner said "I give go ahead for all".

| # | Question | Answer | Work |
| --- | --- | --- | --- |
| 1 | Scrub the leftover export-fork mentions? | Remove everything except the construction history | Remove the mentions from the roadmap, specs and eval cases; keep CHANGELOG and session dumps |
| 2 | The local `../export-fork` repo | The owner deletes it; Claude forgets it | — |
| 3 | Drop `queries_differing.py` too? | Yes, and remove whatever is left of it: declutter, no legacy | Remove the dashboard reader, the BA tool and the references |
| 4 | `error_pages_as_steps` from hypotheses | Yes | Count the states cited by confirmed `flaky` / `deterministic_error` hypotheses |
| 5 | Accept τ from a page and a chat route | Yes | Build it |
| 6 | Re-fingerprint only merges | Yes | — |
| 7 | A profile switch retires and creates screens | Yes | — |
| 8 | "variant" in the UI | Rename in the UI too, to stay consistent | Process model in the UI and the URLs |
| 9 | Guards over decision-point chains | OK | — |
| 10 | A deep-link entry counts as an instance | Yes | A `deep_link` trigger |
| 11 | Every PROC opens its PRC | Yes, keep it | — |
| 12 | A button for check runs | Yes, a button | Build it |
| 13 | Polymorphic `target_id` / `about_ref` → `entity_refs` | Move now | Migration |
| 14 | A person accepts the classifier | Yes | Build it |
| 15 | Milestone tags | M1 is OK | Tag `v2.0.0-m1` |
| 16 | G1 overturn semantics | Put it on the roadmap to discuss later | Roadmap item |
| 17 | G3 release watch poller | No: releases come from scans only | — |
| 18 | G7 rule keys H- vs BR- | Asked what they are; explained; (b) used until the owner says otherwise | A confirmed rule gets a BR key linked to the BA's record |
| 19 | G12 the assistant starts check runs | Yes, after the owner confirms in the chat | Chat tool |
| 20 | Order: pages first, then the gaps | OK | — |
| 21 | OV-1…OV-5 | Any BA may overturn; confirming an A/B test adds its cookie to Hints; retired screens are kept forever; Decided is per portal; export DMN tables as well | — |
| 22–24 | Eval trials, the 038b rebase, close-out and merge | Go ahead for all | — |
