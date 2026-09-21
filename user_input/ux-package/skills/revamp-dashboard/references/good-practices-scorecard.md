# Good practices scorecard

Score the result honestly against this table before handing any dashboard work back — this is the same discipline a design system should apply to itself. Where the score is low, say so and say why rather than presenting the work as finished.

| Category | Ask yourself |
|---|---|
| **Token fidelity** | Does every color/spacing/radius value in the code trace back to a named token, with zero hardcoded literals duplicating a token value? |
| **Component states** | Does every interactive element have hover, focus, active, disabled, loading, empty, and error states — not just the default? |
| **Accessibility** | Semantic elements throughout? Every color-coded meaning has a second signal? Contrast checked at actual rendered sizes, on every pairing used, not just the primary one? Full keyboard reachability with a visible focus state? |
| **Responsive** | Does each breakpoint tier have an intentional, decided layout — not just a shrunk desktop layout? Touch targets ≥44px? |
| **Motion discipline** | Does every animation serve a state change the user needs to track? Is `prefers-reduced-motion` respected? Does the total animation count stay within the stated budget (3, if using the bundled Console system)? |
| **Performance** | Fonts subset/self-hosted where it matters? No obvious render-blocking bloat? Images sized appropriately? |
| **Migration safety** (revamps only) | Same behavior preserved unless a behavior change was explicitly requested? Migrated incrementally with a reviewable diff? Empty and error states screenshotted, not just the happy path? |

A useful habit: run this scorecard once *before* considering the work done, not just when someone asks for it — most of what it catches is cheaper to fix while the relevant code is still open in front of you than after it's been handed off.
