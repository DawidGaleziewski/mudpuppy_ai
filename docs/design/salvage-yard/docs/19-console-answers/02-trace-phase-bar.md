# Q2 · A phase bar for Trace (spec 056)

**Question.** How are a scan's phases drawn over time on the scan's Trace tab?

**What we assumed.** The spec text of 056 wasn't in what we received. This answer assumes Trace lists one scan's steps
in time order and that the backend can tell which phase each step belongs to. If your phases are named differently, the
names change; the kinds and the drawing below still apply.

## Decision

**One bar above the trace: the scan's whole time, cut into its phases, each phase a button that filters the trace.**

```
PHASES · AI SCAN 01a110d5-2028                     6 Oct 10:49:20Z – 10:58:44Z · 9 min 24 s · 171 steps · □ STOPPED
┌─┬───────────────────────────┬─────────────────────────┬───────────┐
│S│ EXPLORE                   │ FILL FORMS (pressed)    │ EXPLORE  ▌│   ▌ = ended in a failure
│ │ 10:49:31Z · 4 min 9 s ·…  │ 10:53:40Z · 3 min 25 s… │ 10:57:05Z │
└─┴───────────────────────────┴─────────────────────────┴───────────┘
10:49:20Z        10:51Z          10:53Z         10:55Z         10:57Z        10:58:44Z
Showing Fill forms: steps 77–139 · 10:53:40Z – 10:57:05Z · Show all 171 steps
```

| | Rule |
|---|---|
| **What a phase is** | A stretch of time in which the scan did one kind of work. Phases are **data** from the backend (name, start, end, kind, state, first and last step); the bar never invents one |
| **Phase names** (proposal for the backend) | Start (browser, seed page, sign-in) · Replay (to a checkpoint) · Explore (following links) · Fill forms (the happy path with the persona's test data) · Probe (form probes) · Check (check runs) · Waiting for you · Quiet |
| **Kinds** (`data-kind`) | `work`: a neutral plate (every phase above except the next two) · `wait`: **Waiting for you**, the scan is blocked on a person (sign-in, captcha, approval). Marker tint: the only orange on the bar, because it is the only part that needs someone · `quiet`: **no new step for 60 s or more**, dashed and hatched (nothing was observed). The server cuts quiet gaps out of the phase they fall in |
| **States** (`data-state`) | `done` (default) · `running`: the open end is dashed cyan, the bar ends at "now" · `failed`: a red end cap; red is used for nothing else here |
| **Width** | By length: `--sy-phase` = the phase's seconds, phases share the track (flex) with a **24 px floor**, so a 20-second Start stays clickable on a two-hour scan. The axis ticks are placed by time and can drift a few pixels where a floor applies |
| **Text in a phase** | Name (mono, caps) and a time line: start · length · steps. Under 72 px (`data-narrow`) the time line is for screen readers only; the full text is also in `title` |
| **Pressing a phase** | Filters the trace below to that phase's steps (`aria-pressed="true"`, chalk). A status line says what is shown, with **Show all**. Pressing it again clears the filter. One phase at a time |
| **Axis** | Start time, round ticks at least 64 px apart, end time ("now 11:53Z" while running). On phones only the two ends |
| **Live** | A running scan's last phase grows. Recompute the widths once a minute and when a phase changes, not per event |
| **Phones** | The same bar, full width; names truncate; the axis keeps its ends |

## Markup

```html
<figure class="sy-phasebar" aria-labelledby="pb-h">
  <figcaption id="pb-h">Phases · AI scan 01a110d5-2028 · 9 min 24 s · <span class="sy-status" data-status="stopped">Stopped</span></figcaption>
  <ol class="sy-phasebar__track">
    <li class="sy-phasebar__phase" data-kind="work" data-narrow style="--sy-phase: 11">
      <button class="sy-phasebar__btn" type="button" aria-pressed="false" title="Start · 10:49:20Z · 11 s · steps 1–11">
        <span class="sy-phasebar__name">Start</span><span class="sy-phasebar__time">10:49:20Z · 11 s · steps 1–11</span></button></li>
    <li class="sy-phasebar__phase" data-kind="work" style="--sy-phase: 249">…Explore…</li>
    <li class="sy-phasebar__phase" data-kind="work" style="--sy-phase: 205">…Fill forms… aria-pressed="true"</li>
    <li class="sy-phasebar__phase" data-kind="work" data-state="failed" style="--sy-phase: 99">
      <button …><span class="sy-phasebar__name">Explore</span><span class="sy-phasebar__time">…</span>
        <span class="sy-sr-only">, ended in a failure at step 171</span></button></li>
  </ol>
  <div class="sy-phasebar__axis" aria-hidden="true"><span style="left: 0">10:49:20Z</span> … <span style="left: 100%">10:58:44Z</span></div>
</figure>
<p role="status">Showing Fill forms: steps 77–139 · 10:53:40Z – 10:57:05Z · <a href="?phase=">Show all 171 steps</a></p>
```

Legend (once per page, under the bar): `ul.sy-legend > li.sy-legend__item` with `span.sy-phasebar__key[data-kind|data-state]`:
Working · Waiting for you · Quiet · Running · Ended in a failure. Demo: `design-system/components.html#c-22-phase` (a stopped
scan from the fixture, and an illustrative running one with a wait and a quiet stretch).

## React

```tsx
type Phase = { name: string; start: string; end: string | null; kind: "work" | "wait" | "quiet";
               state: "done" | "running" | "failed"; firstStep: number; lastStep: number };

<figure className="sy-phasebar" aria-labelledby={id}>
  <figcaption id={id}>…</figcaption>
  <ol className="sy-phasebar__track">
    {phases.map((p, i) => (
      <li key={i} className="sy-phasebar__phase" data-kind={p.kind}
          data-state={p.state === "done" ? undefined : p.state} data-narrow={px(p) < 72 ? "" : undefined}
          style={{ "--sy-phase": seconds(p) } as React.CSSProperties}>
        <button className="sy-phasebar__btn" type="button" aria-pressed={selected === i}
                title={`${p.name} · ${timeLine(p)}`} onClick={() => toggle(i)}>
          <span className="sy-phasebar__name">{p.name}</span><span className="sy-phasebar__time">{timeLine(p)}</span>
          {p.state !== "done" && <span className="sy-sr-only">{p.state === "running" ? ", running" : `, ended in a failure at step ${p.lastStep}`}</span>}
        </button></li>))}
  </ol>
  <div className="sy-phasebar__axis" aria-hidden="true">{ticks.map(t => <span key={t.at} style={{ left: `${t.pct}%` }}>{t.label}</span>)}</div>
</figure>
```

Keep the selected phase in the URL (`?tab=trace&phase=3`) so a filtered trace can be linked.

## What to change

- [ ] Copy `salvage.css` (section "2.2 · Phase bar").
- [ ] Backend: phases per scan (name, start, end, kind, state, first/last step), quiet gaps of 60 s or more cut out by the server.
- [ ] Trace tab: the bar above the trace list; the filter and its status line; `?phase=` in the URL.

## Acceptance

- Every phase has a visible button of at least 24 × 40 px; the narrowest still has its name in the accessible name.
- Waiting for you is the only orange on the bar; red only as the failed end cap.
- Pressing a phase filters the trace and announces "Showing …"; Show all clears it; the URL keeps it.
- A running scan's bar ends at "now" and grows once a minute without the page jumping.
- Forced colours: segments outlined, the pressed one in Highlight, the failed one with a 4 px right edge.
