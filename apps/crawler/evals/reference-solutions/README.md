# Reference solutions

Known good outputs (G-33 "reference solution"), kept byte for byte as they were exported: never
regenerate or reformat them (they are in `.prettierignore`).

| Folder | What | Approved |
| --- | --- | --- |
| `reference-insurer/PROC-001/` | The process export of PROC-001 "Oblicz składkę OC/AC" from the live scans of 2026-10-17 (six map and probe scans, one trace choosing AC; BA session 01a14b1b), as `pnpm docs:process-export reference-insurer PROC-001` wrote it at commit 12b0d1c | the owner, 2026-10-17: "it is really good" |

It is not flawless: it holds the crawler and export problems of R-73 (the home page as step 1,
F-15; the blank page, F-11; the radio group as two fields, F-16) and has no validation rows for
the vehicle value box (no probe scan covered 4b). `export-quality.ts` scores it against the ground
truth; its test pins those scores, so the known flaws are the only points it loses.
