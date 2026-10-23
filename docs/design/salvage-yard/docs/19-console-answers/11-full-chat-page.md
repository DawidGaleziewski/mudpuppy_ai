# Q11 · The full chat page

**Question.** 2.0 has the drawer and Home's Assistant plate but no full chat page. Do the step tracker ("Where this portal
is"), the credentials form and the scope checklist go anywhere in 2.0, or are they gone?

## Decision

**No full chat page in 2.0, and none of the three stays in a chat page.** They came from 1.x's guided workflow (Scan → Map
→ Narrow → Document → Amend), which 2.0 replaced: scans keep the model current, processes are proposed automatically, and
the work is reviewing what changed. Each part goes where that job now lives.

| 1.x (guided chat, SCR-007) | 2.0 |
|---|---|
| **Conversation, full height** | The **drawer** on every page (Ctrl J), with an **Open in Workbench** link when a thread gets long, and the **Workbench ▸ Chat** path (beta), which is the full-page conversation. `/chat` redirects to the Workbench's Chat path for people who have it, otherwise to Home with the drawer open |
| **Step tracker "Where this portal is"** | **Retired** for portals that have been scanned: Home's counts and its **Needs you** plate say what to do next. It survives in one place: Home of a **new portal with no scan yet**, as a three-item **Get started** list (`.sy-steps`): 1 · Environment set (address, how far the crawler may go) · 2 · Sign-in, if the portal needs one (a persona with a credential) · 3 · First scan. Each item links to where it's done; the list disappears after the first scan |
| **Credentials form** | **Settings ▸ Credentials** (the vault form, unchanged). In the flow: the drawer's just-in-time credential card stays as designed (`screens/03-assistant-states.html`, state 3: a vault form inside the drawer, not a message), and in the Workbench the assistant proposes **Add a persona** (Q4), whose "Store a new credential…" opens the same vault form as a dialog. A credential is never typed into a chat message |
| **Process scope checklist** (tick screens, mark start and end, note per screen, process name, persona) | **Processes**: proposals arrive drawn (v2-09) with Accept · Rename · Split · Merge · **Move screens**. To make one by hand: **New process** on Processes, which opens the same checklist as v1 `05-process-edit` (screens with start / end and a note each, name, and the persona as the process's precondition) |
| **Scan progress region** | The composer's scan line (Q12) and Scans |

**Why no full chat page.** Two full-height conversations (a chat page and the Workbench Chat path) would split threads and
features. The drawer covers asking about what you're looking at; the Workbench covers long work with the assistant.

## What to change

- [ ] Don't port the chat page; redirect `/chat` as above.
- [ ] Home: the Get started list for portals without a scan.
- [ ] Processes: New process with the scope checklist (v1 05 layout, 2.0 parts).

## Acceptance

- No route renders the 1.x chat page; old `/chat?portal=…` links land in the Workbench Chat path or Home with the drawer.
- A brand-new portal's Home shows Get started; after its first scan Home shows the usual counts.
