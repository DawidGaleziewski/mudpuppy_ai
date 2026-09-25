# Use cases (Cockburn style, as-is)

Write use cases only from trace evidence (`get_process`); from map data alone, write a `followup`
(mode `trace`) instead.

| Field | From |
|---|---|
| `primary_actor` | the trace persona (e.g. `guest`) |
| `preconditions[]` | state before step 1 (e.g. "on the home page, no quote in progress") |
| `trigger` | the first step's intent + the verbatim label clicked |
| `main_flow[]` | one entry per step: `{n, actor_or_system: "actor" or "system", text}`; actor steps quote labels/values, system steps state the observed outcome |
| `alternate_flows[]` | other paths seen in edges or other traces (e.g. going back a step) |
| `exception_flows[]` | validation messages and refusals seen (verbatim) |
| `postconditions[]` | last observed state; if the trace hit a boundary, say so |

Example main flow (process "Oblicz składkę OC/AC"):
1. actor — opens "Oblicz składkę" from the home page.
2. system — shows step "Dane pojazdu" at `/kalkulator/pojazd`.
3. actor — enters "Rok produkcji" and "Pojemność silnika", presses "Dalej".
4. system — shows "Dane kierowcy".
…

Boundary: when the trace ended with `boundary_reached` (a mutating action refused on production), set
the process `observed_extent: until_boundary`, mark the remainder `not_observable` with an
`open_question` ("What happens after "Kup polisę"?"), and do not invent the rest of the flow.

Relate: `use_case describes process`; `capability contains process`; requirements `refine` the use
case.
