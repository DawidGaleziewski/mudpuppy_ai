# workbench/

The contract between the Workbench (generative UI beta) and the model, plus examples. Specs and rules live in `docs/14`–`17`.

| Folder | What |
|---|---|
| `schema/` | `view-spec.schema.json` (what the model returns), `narration.schema.json`, `command.schema.json`, `commands.json` (writes, APIs, undo), `catalogue.json` (the 15 components: paths, placement, phase, data, actions), `tools.json` (tool definitions for the Claude Messages API; flattened, see `docs/17` §4.4) |
| `examples/` | `valid/` view specs per path; `invalid/` specs the server must drop or repair, with the expected code in `invalid/EXPECTED.json`; `narration/`; `command/` |
| `tools/gen_wb_schema.py` | The single source of all of the above. Change it and run `python3 workbench/tools/gen_wb_schema.py`; never edit the JSON by hand |
| `reference/` | The runnable reference app (Starlette + Jinja + htmx 2 + SSE, scripted assistant, tests, evals) is being finished and ships in the next update of this package |

Fixture: `docs/13-v2-fixtures.md` §Workbench.
