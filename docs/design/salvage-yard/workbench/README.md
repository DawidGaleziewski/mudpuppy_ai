# workbench/ — the generative UI contract and a working reference

Everything the Workbench (beta) needs besides the CSS and the docs. The CSS is `design-system/css/genui.css` (on top of
`salvage.css`); the behaviour, rules and plan are in `docs/14`–`17`. The shared data is the
[Workbench fixture in docs/13](../docs/13-v2-fixtures.md#workbench-gen-ui-beta-fixture).

| Folder | What it holds | Who reads it |
|---|---|---|
| `schema/` | **The contract with the model.** `view-spec.schema.json` (what the assistant may return), `narration.schema.json`, `command.schema.json`, `commands.json` (the command catalogue: API, confirm text, undo), `catalogue.json` (each component's paths, phase, placement per layout, data, actions), `tools.json` (the three tools in Anthropic tool-use format, flattened: no top-level `allOf`/`oneOf`) | The server validates with it; the model adapter sends `tools.json`; tests read it |
| `examples/` | `valid/` specs per path (the server must accept them untouched), `invalid/` specs + `EXPECTED.json` (the reason code each one must produce), `narration/` (one grounded, one with a number the events don't contain), `command/` | Contract tests (`reference/tests/test_catalogue.py`), evals, docs 16–17 |
| `tools/gen_wb_schema.py` | **The single source** for everything in `schema/`, `examples/` and `a2ui/`. Edit this, run it, never edit the JSON by hand | You, when the catalogue changes |
| `a2ui/` | **R-96 spike.** `catalog.json` (the same catalogue as an A2UI v0.9.1 catalog, generated), example message streams, the refusals, `check.py` (validation + the agent filter) | The spike; `reference/tests/test_a2ui.py`; `docs/19-console-answers/13-a2ui-catalogue.md` |
| `reference/` | A runnable Workbench: Starlette + Jinja2 + htmx 2 + one SSE stream, scripted assistant, stub scan engine, tests, evals, Playwright run. See [reference/README.md](reference/README.md) | Engineers starting the build |

## How the pieces line up

| Concept | Doc | Contract | CSS | Reference |
|---|---|---|---|---|
| Paths, layouts per phase, behaviour rules, the step-by-step plan | [14](../docs/14-workbench.md) | `catalogue.json` (paths, phase, placement) | `.sy-wb--inline · --split · --focus` | `catalogue.layout_for`, `templates/layouts/` |
| Style and good practice (provenance, writing, motion, a11y) | [15](../docs/15-genui-guidelines.md) | `plainText` strings, limits | `.sy-genmark`, dashed = generated | `frames/genview.html.j2`, `frames/why.html.j2` |
| The 15 components and the frames around them | [16](../docs/16-genui-components.md) | `$defs/<Type>` in `view-spec.schema.json` | `.sy-genview`, `.sy-narration`, `.sy-cmd`, `.sy-film` … | `templates/components/<Type>.html.j2`, `render.py` `vm_<Type>` |
| Architecture: htmx vs React, two lanes, validation layers, stream, security, testing, tickets | [17](../docs/17-genui-architecture.md) | reason codes in `EXPECTED.json` | — | `catalogue.check_view`, `app.stream`, `tests/`, `evals/` |

## Changing the catalogue

1. Edit `tools/gen_wb_schema.py` (a component's binds or props, a path's limit, a command) and run
   `python3 workbench/tools/gen_wb_schema.py`.
2. Add or update the component's partial in `reference/templates/components/` and its view-model in `reference/render.py`.
3. Run `python3 -m unittest discover -s tests -t .` and `python3 evals/run_evals.py` in `reference/`.
4. Update the component's entry in `docs/16` and, if it is new, its class in `genui.css` and the gallery
   (`design-system/genui-components.html`).
