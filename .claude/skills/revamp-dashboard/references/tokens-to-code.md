# Turning tokens into real code

Concrete patterns for wiring any token set (the bundled Console system or a supplied one) into an actual codebase.

## Plain CSS: custom properties

```css
:root {
  --surface-0: #0A0A08;
  --surface-100: #131310;
  --ink-100: #E8D9AE;
  --brand: #FFB000;
  --signal-error: #FF3B30;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --space-1: 4px;
  --space-4: 16px;
  --radius-none: 0px;
  --radius-full: 9999px;
}
```

Reference by name everywhere (`background: var(--surface-100)`), never by copying the hex value. If a token is reserved for one purpose, consider a second purpose-named alias pointing at the same value (`--status-running: var(--accent-3);`) — documents intent at the call site and lets the two diverge later if the design ever wants that.

## Tailwind (v4 / CSS-first config)

```css
@theme {
  --color-surface-0: #0A0A08;
  --color-surface-100: #131310;
  --color-brand: #FFB000;
  --color-signal-error: #FF3B30;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --spacing-1: 4px;
  --radius-none: 0px;
}
```

Gives `bg-surface-100`, `text-brand`, `rounded-none` with autocomplete and a single edit point. Resist one-off arbitrary values (`bg-[#131311]`) even when close to an existing token — that's exactly the drift a token system exists to prevent.

## CSS-in-JS / theme objects

```ts
export const theme = {
  color: { surface0: "#0A0A08", surface100: "#131310", brand: "#FFB000", signalError: "#FF3B30" },
  font: { mono: '"JetBrains Mono", ui-monospace, monospace' },
  space: { 1: 4, 4: 16 },
  radius: { none: 0, full: 9999 },
} as const;
```

Type the object so autocomplete and type errors catch a typo'd token name before it ships.

## Keeping component docs honest as the code evolves

A design system's component reference is a contract, not just documentation, and contracts drift if nothing enforces them:

- When a component needs a state or variant the original spec didn't cover, add it to the code **and** a note in the reference doc in the same change — not "document it later."
- When you deviate from the spec for a good reason, say so in a code comment near the deviation — the next person needs to know it's deliberate, not an oversight to "fix."
- If a whole new pattern gets invented during implementation, flag it back to whoever owns the design system rather than letting code and docs quietly diverge.
