# T-13 · A command that fails before it starts anything; the live map at once

**Answers:** Q9 · **Size:** S · **Depends on:** your fix on R-103 (end the command as failed) · **Demo:**
`design-system/genui-components.html#g-start`

## Decision

**The generic failed state, saying what was created: nothing.** A command the person confirmed didn't happen; that is a
failure of the command, so red is honest (red = failure, and this is one). What keeps it calm is what it doesn't do: no
ErrorCard, no scan status, nothing in Scans, no red anywhere else.

```
START A MAP SCAN                                   ✕ DIDN'T START
Created    nothing: no scan, no pages, nothing in Scans
Why        “robots.txt could not be read (network error: fetch failed); no page is opened until it can.”
Portal     http://127.0.0.1:4010/ (sandbox) didn't answer at 00:31:12Z
Reference  ERR-…
The crawler refused before it opened a page. The portal looks down; nothing in it broke.
[Start again]  Check the address   Start again sends the same scan once more.
```

| | Rule |
|---|---|
| Status word | **Didn't start** (not "Failed": the words say exactly what happened) |
| The crawler's sentence | Quoted as is, under "Why" |
| Start again | Runs the **same** command again (same args): the person already confirmed it; the card goes back to running. To change something, they ask for a new scan |
| Check the address | Link to Settings ▸ Environments for that environment |
| Binding | The card binds to the **run id the start call returns**. No id within **30 s**, or an error → failed. It never adopts another scan's id (the bug in R-103) |

**When it does start: the live map at once.** On the run's `scan.started` event the server places the **Live map** card
straight away (the data lane, no model, D-39). The command card turns **Started** with the scan id and "Jump to the live map".
The assistant's words arrive later beside it. Because no model chose this view, the card has **no "generated" mark and no
"Why this view?"**; its source line says "placed by the server when the scan started". Before the first page the map shows
`.sy-loader--block` "Waiting for the first page" in a box of its final size.

## Acceptance

- With the portal down, `scan.start` ends as "Didn't start" within 30 s with the crawler's sentence; nothing appears in Scans.
- With the portal up, the live map card appears within a second of `scan.started`, before any assistant text.
