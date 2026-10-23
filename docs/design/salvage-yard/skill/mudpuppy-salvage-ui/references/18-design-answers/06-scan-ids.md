# Q6 · Full scan ids (F-05, D-9): how they appear on screen

**Question.** Scan ids are UUIDv7; their first 8 characters are a timestamp that changes only every ~65 s, so two scans a
minute apart collided (`01a16388`). The owner decided on full scan ids (D-9). That changes the schema. How should a full
UUID appear in cards and chips: shortened with the full id on hover, or something else?

## Decision

**Data uses the full id; people see a 13-character short form.**

| Where | What |
|---|---|
| JSON, the Workbench contract, URLs, API paths, exports, copy-paste, logs | The **full id**, lowercase: `01a110d5-2028-7000-8f3e-5c1a9b27d460` |
| Cards, chips, tags, tables, narration, headings | The **short form = the first two groups**: `01a110d5-2028` |
| Hover and keyboard | The full id in `title`; a **Copy** button next to the id where people may need it (scan header, side sheet, scan row) |
| The scan's own page | The full id, written out once (`.sy-id--full`), with Copy |
| On a time axis (release timeline) | Label the mark by **start time** ("10:49Z"); the id is in its accessible name. Ids don't fit between marks |
| Event references | Data: `01a110d5-2028-7000-8f3e-5c1a9b27d460#171`. Screen: "step 171" (citation chip), title with the short form |

**Why the first two groups.** In UUIDv7 the first 48 bits are the start time in milliseconds, so the 13-character prefix is
unique unless two scans start in the same millisecond, keeps ids sorting by time, and reads the same as today's ids plus four
characters. The console already labelled runs this way ("Open run 01a110d5-2028"). The random tail would be unique too, but
sorts randomly and looks unrelated to the ids people know.

**If two scans ever share the short form** (same millisecond), show the third group for both: `01a16388-1f2c-7000` and
`01a16388-1f2c-7001` (UUIDv7's counter makes the third group differ). Decide this per list, from the ids in it.

**Never** the 8-character form any more: not in the contract, not on screen. The old "match the short id against the
conversation's scans first" workaround goes away, because the model now gets and returns full ids.

## Parts

```html
<span class="sy-id" title="01a110d5-2028-7000-8f3e-5c1a9b27d460">01a110d5-2028</span>
<button class="sy-id__copy" type="button" aria-label="Copy the full scan id 01a110d5-2028-7000-8f3e-5c1a9b27d460">Copy</button>

<a class="sy-tag sy-tag--sm" href="/scans/01a110d5-2028-7000-8f3e-5c1a9b27d460"
   title="01a110d5-2028-7000-8f3e-5c1a9b27d460">01a110d5-2028</a>

<span class="sy-id sy-id--full">01a110d5-2028-7000-8f3e-5c1a9b27d460</span>   <!-- wraps -->
```

- `.sy-id` is mono, never uppercased, never wrapped. `.sy-id--full` wraps anywhere. `.sy-id__copy` is a quiet 24 px button
  (44 px on touch); after copying it says "Copied" for 2 s through the page's live region.
- Screen readers get the short form in text; the full id only from Copy and on the scan page (reading 36 characters aloud
  helps nobody).

## Contract change (done at the source)

```
scanId    ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
eventRef  ^<scanId>#[0-9]{1,6}$
```

`examples/invalid/short-scan-id.json` (an 8-character id) is now dropped as `bad_bind_or_props`. All examples, the reference
app and its tests use full ids; the fixture's full ids are in `13-v2-fixtures.md` (§ "Scan ids").

## A2UI (R-96)

The question moves rather than goes away: in A2UI the same patterns sit in the property schemas of our custom catalog, and
the short form is a formatting rule in the renderer, not something the agent writes. See `09-a2ui-carry-over.md`.

## React

```ts
// apps/web/src/lib/scanId.ts
export const shortScanId = (id: string, siblings: string[] = []) => {
  const g = id.split("-");
  const short = `${g[0]}-${g[1]}`;
  const clash = siblings.some(o => o !== id && o.startsWith(short));
  return clash ? `${short}-${g[2]}` : short;
};
```

```tsx
<span className="sy-id" title={id}>{shortScanId(id, idsInThisList)}</span>
<CopyButton className="sy-id__copy" value={id} label={`Copy the full scan id ${id}`} />
```

## What to change

- [ ] Contract: take the regenerated schema (D-9).
- [ ] Every scan id on screen goes through `shortScanId`; every link, API call and export uses the full id.
- [ ] Add Copy where the id is a fact people act on (scan header, side sheet, scan rows).
- [ ] Release timeline: label scan marks by start time.
- [ ] Remove the short-id matching workaround in the Workbench.

## Acceptance

- Two scans started a minute apart show different ids everywhere.
- Copy puts the full id on the clipboard; the link opens the right scan.
- No 8-character scan ids remain on screen or in the contract.
- Demo: `design-system/components.html#c-21-ids`; in use: every screen (ids converted), the Workbench side sheet (`wb-01`).
