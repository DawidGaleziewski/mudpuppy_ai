---
name: create-persona
description: Guides building a portal persona with a business analyst through plain questions, then saves it with save_persona. Use when a BA wants a new persona (a way of visiting a portal: anonymous or logged in), or when save_persona refuses a persona.
---

# Create a persona

A persona says who visits the portal and how far they may go. Ask one question at a time, in the
BA's words, and wait for the answer.

## Questions, in order

1. **Which portal?** It must already exist (`portals/<portal>/portal.yaml`). If not, a developer adds it.
2. **Logged in or anonymous?**
   - Anonymous: `extends: ["../_mixins/anonymous-base.yaml"]`. No credentials.
   - Logged in: ask what the portal calls each login field (for example login, password), then pick
     a reference name per field: `ref:NAME`, letters, digits and underscore only (`ref:PG_BANK_LOGIN`).
     The persona holds only these names, as `auth: { login: ref:PG_BANK_LOGIN, ... }`.
     Tell the BA to type the real values into the dashboard credentials form beside the chat.
     Never ask for, repeat or accept a password, token or key in chat.
3. **How far may this persona go?** (`max_action_class`, lowest to highest)
   - `read`: only look at pages.
   - `mutating`: also change things (fill and save forms, edit own data).
   - `destructive`: also delete or cancel things.
   - `external-side-effect`: also do things that reach outside the portal (send a message, pay,
     submit an application).
   Default is `read`. It can only narrow the portal's own limit, never widen it.
4. **Locale or viewport?** Optional. Skip it and the persona inherits them from the mixin
   (`pl-PL`, 1366x768).
5. **Short id**: lowercase slug (`client`, `guest`, `advisor`), unique within the portal.

## Save

Call `mcp__pathfinder-chat__save_persona` with
`{ portal, persona: { id, extends?, auth?, max_action_class?, locale?, viewport? } }`.
On success, name the file and list the `ref:` names the BA still has to store in the credentials form.

## Refusals, in plain words

- `INLINE_SECRET`: a real secret was put where only a `ref:NAME` belongs. Nothing was saved; use
  the credentials form and refer to it by name.
- `CEILING_WIDENED`: the persona asked for more than the portal allows. Choose a lower level.
- `PERSONA_EXISTS`: that id is taken for this portal; saved personas are never overwritten. Pick another id.
- `INVALID`: the file would not load (for example a bad `ref:` name or a missing mixin). Quote the
  listed problems, fix the answer, retry.
- `MISSING_INPUT`: the portal is not configured, or a required answer is missing. Ask for it.

Examples: `personas/proving-ground-bank/guest.yaml` (anonymous), `client.yaml` (logged in).
