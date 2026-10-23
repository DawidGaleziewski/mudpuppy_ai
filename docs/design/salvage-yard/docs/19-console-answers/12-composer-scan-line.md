# Q12 · The scan line in the composer

**Question.** You show status · "Scan 01a16624-db89 · 12 / 120 steps · 9 pages · 3 queued", with "Nothing for 9m" when
quiet. Home's mock shows "Check run 01a1340c · 17 Oct · 64 checks". Which words?

## Decision

**One grammar for every scan line, yours almost as is.** Home's release strip was a short summary of the *last finished*
scan; the composer shows the scan that is running or just stopped. Both follow the same order:

> **[status]** {Kind} {short id} · {done} / {limit} {unit} · {pages} pages · {queued} queued · {where or when}

| Part | Words |
|---|---|
| Status | `.sy-status`: Running · Stopped · Failed · Completed |
| Kind | **AI scan** or **Check run** (the two kinds in 2.0; not "Scan" alone, because both can run on a portal) |
| Short id | The 13-character form in `.sy-id` with the full id in `title` (D-49). Not 8 characters: `01a1340c` alone was the old form |
| Progress | AI scan: `12 / 120 steps · 9 pages · 3 queued`. Check run: `40 / 64 checks · 3 findings` |
| Last part | Running, events arriving: `now at /porownanie` · Running, **no new step for 2 min or more**: `no new step for 9 min` (muted; the status stays Running, we don't guess it's stuck) · Stopped: `at /kontakt` · Completed: the end time, `17 Oct 10:05Z` |
| Link | **Open** (the scan's page). Not "Open in Scans": the line is already about a scan |

```html
<div class="sy-scanline">
  <span class="sy-status" data-status="running">Running</span>
  <span>AI scan <span class="sy-id" title="01a110e7-2068-7d10-8c55-91e2b3f4a6d8">01a110e7-2068</span> · 12 / 120 steps · 9 pages · 3 queued ·
    <span class="sy-muted">no new step for 9 min</span></span>
  <a href="/scans/01a110e7-2068-7d10-8c55-91e2b3f4a6d8">Open</a></div>
```

Examples (demo: `components.html#c-22-scanline`):

- ■ Running · AI scan 01a110e7-2068 · 12 / 120 steps · 9 pages · 3 queued · now at /porownanie · Open
- ■ Running · AI scan 01a110e7-2068 · 12 / 120 steps · 9 pages · 3 queued · *no new step for 9 min* · Open
- □ Stopped · AI scan 01a110d5-2028 · 171 / 400 steps · 17 pages · 113 queued · at /kontakt · Open
- ■ Completed · Check run 01a1340c-3b97 · 17 Oct 10:05Z · 64 / 64 checks · 9 findings · Open

Home's "Last scan" uses the same words without the status pill: "Check run 01a1340c-3b97 · 17 Oct 10:05Z · 64 checks ·
9 findings".

**Which scan the composer shows:** a running scan of this portal; otherwise one that stopped in the last 24 h (it may need
you); otherwise none. The line is not a live region: it updates silently; stops are announced once by the page's status
region.

**Quiet thresholds:** the scan line says "no new step" after 2 min (so it doesn't flicker on short pauses); the Trace
phase bar marks quiet stretches of 60 s or more (Q2), because there it is looking back, not updating live.

## What to change

- [ ] "Scan" → "AI scan" / "Check run"; "Nothing for 9m" → "no new step for 9 min" (muted, from 2 min); "Open".
- [ ] Home's Last scan: the 13-character id and the same order.

## Acceptance

- No 8-character scan ids; the kind word is always there; minutes are written "min".
