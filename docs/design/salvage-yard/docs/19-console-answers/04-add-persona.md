# Q4 · R-95: adding a persona from the Workbench

**Question.** A component for adding a persona from the Workbench.

## Decision

**It is a command card you can edit, not a catalogue component.** Adding a persona is a write, and every write in the
Workbench is a command card the person confirms (D-41). What's new is that this card carries values the person owns, so
its fields are editable before Confirm: `.sy-cmd__form` in `genui.css`.

| | |
|---|---|
| **Command** | `persona.add {name, about?, credential?, test_data?[]}` → `POST /portals/{portal}/personas`. In the contract now (`workbench/schema/commands.json`, `command.schema.json`, `tools.json`); `scan.start`'s `persona` takes any persona name instead of only `guest` |
| **Who starts it** | The assistant proposes it (`propose_command`), e.g. when a scan reaches a sign-in it can't pass or a process needs a signed-in user ("Przedłuż polisę"). The person can open it too: **Add a persona…** at the end of the Persona list in the Start-a-scan card, and **Add a persona that can sign in** on an ErrorCard whose stop reason is a sign-in |
| **Fields** | **Name** (lower case, `^[a-z][a-z0-9-]{1,23}$`) · **Who this is** (plain words, 140) · **Signs in with**: Nothing (browses as a guest) / an existing vault reference / **Store a new credential…** · **Test data for forms**: rows of *field as recorded* (route + label) → value, **Add a value** picks from the fields the scans recorded |
| **Drafted vs yours** | The assistant fills what it can. A field you change gets the person's manila edge (`[data-edited]`) and its help says "Changed by you (was …)" |
| **Secrets** | Never in the card, the chat, the model or the logs. The card names a credential by its vault reference. **Store a new credential…** opens the vault dialog (server-owned, the v1 Settings vault form); the value goes straight to the vault, and the new reference is selected in the card. A model that tries to pass a password is refused by the schema (`examples/command/invalid-persona-secret.json`) |
| **Test data** | Test values only, never a real customer's; said under the table. Values are plain text, ≤ 200 characters, ≤ 20 rows |
| **Confirm** | Sends what the card shows (the form is the card's body, Confirm is its submit button). Nothing is saved before |
| **Done** | "Persona client added to reference-insurer. Scans on sandbox can now sign in as client." · **Start a scan as client** (opens a `scan.start` card) · Open in Settings ▸ Personas · **Undo** (removes it until a scan uses it) |
| **Where** | Sandbox during the beta, like every Workbench command |
| **Settings** | Settings ▸ Personas gets the same fields as a normal form (Add persona), so the Workbench is not the only way |

## Markup

```html
<section class="sy-cmd" data-cmd-state="proposed" aria-labelledby="pa-t">
  <header class="sy-cmd__head"><span id="pa-t" class="sy-cmd__title" tabindex="-1">Add a persona</span>
    <span class="sy-status" data-status="draft">Proposed</span></header>
  <form id="pa-form" class="sy-cmd__body sy-cmd__form" aria-describedby="pa-why">
    <p id="pa-why" class="sy-cmd__wide sy-small sy-muted">Proposed by the assistant: …reason…</p>
    <label class="sy-field" data-edited><span class="sy-field__label">Name</span>
      <input class="sy-input sy-input--md" name="name" value="client" required pattern="[a-z][a-z0-9-]{1,23}" aria-describedby="pa-name-h">
      <span id="pa-name-h" class="sy-field__help">Lower case, used in scans and filters. Changed by you (was “klient”).</span></label>
    <label class="sy-field"><span class="sy-field__label">Who this is</span><input class="sy-input sy-input--md" name="about" maxlength="140"></label>
    <label class="sy-field"><span class="sy-field__label">Signs in with</span>
      <select class="sy-select sy-select--md" name="credential">
        <option value="none">Nothing: browses as a guest</option><option selected>CLIENT_LOGIN · sandbox · stored 12 Oct</option>
        <option value="__new">Store a new credential…</option></select></label>
    <div class="sy-cmd__wide">
      <table class="sy-cmd__data"><caption>Test data for forms</caption>
        <thead><tr><th scope="col">Field, as recorded</th><th scope="col">Value</th></tr></thead>
        <tbody><tr><th scope="row">Data urodzenia · dane kierowcy</th>
          <td><input class="sy-input" name="td-dob" value="1985-04-12" aria-label="Value for Data urodzenia"></td></tr>…</tbody></table>
      <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button">Add a value</button></div>
  </form>
  <footer class="sy-cmd__foot"><button class="sy-btn sy-btn--sm sy-btn--primary" type="submit" form="pa-form">Confirm</button>
    <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button">Cancel</button>
    <span class="sy-small sy-muted">Nothing is saved until you confirm.</span></footer>
</section>
```

Demo, with the done card and the vault dialog: `design-system/genui-components.html#g-persona`.

## Contract (generated)

```json
{"command": "persona.add", "args": {"name": "client", "about": "A signed-in customer with one active OC policy",
  "credential": "CLIENT_LOGIN",
  "test_data": [{"field": {"route": "/kalkulator/kierowca", "state": 1, "label": "Data urodzenia"}, "value": "1985-04-12"}]},
 "reason": "Przedłuż polisę needs a signed-in customer, and no persona of this portal can sign in."}
```

The server checks after the schema: the name is new for the portal (`duplicate`), the vault reference exists
(`id_not_found`), each field was recorded on that route (`id_not_found`). Undo: `DELETE /portals/{portal}/personas/{name}`,
until a scan uses the persona.

## React

`CommandCard` gets an `editable` variant: when the command's catalogue entry says so (persona.add), render the body as a
`<form>` from the args, keep the drafted args to compare (`data-edited` on changed fields), and send the edited args on
Confirm. Focus goes to the card's title when it appears, never to Confirm (as for every command card).

## What to change

- [ ] Take the regenerated contract (`workbench/schema/*`), including the new `personaName` and `vaultRef` defs.
- [ ] `genui.css` section "2.2 · A command card you can edit"; the `editable` CommandCard.
- [ ] The vault dialog as a server-owned dialog (reuse the Settings vault form).
- [ ] API: `POST /portals/{portal}/personas`, `DELETE …/{name}`; Settings ▸ Personas form.

## Acceptance

- The proposed card shows the assistant's values; editing one marks it; Confirm sends exactly what's shown.
- No secret value can reach the card, the chat or the model; the contract test for `invalid-persona-secret.json` passes.
- After Done, a new Start-a-scan card lists `client` and the scan can sign in.
