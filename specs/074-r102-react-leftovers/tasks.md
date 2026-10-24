# Tasks: spec 074 (R-102)

- [x] T001 (1) Delete the dead read-model helpers and their tests (each checked unused first)
  (three were dropped features, now wired: the record type word, As of per item, the store
  follows the portal; F-01–F-04)
- [x] T002 (2) Split `glossary._load` by section (complexity under 15), tests and mutants green
  (`_read_yaml`, `_entries`, `_pages`, `_wiki`, `_entry_links`, `_wiki_links`; README byte-identical;
  mutmut: no survivor in `_load` and the link checks, the six in the readers are equivalent
  encoding mutants on lines that were there before; all modules 129 survived of 1014)
- [x] T003 (8) `apps/web/LAYOUT.md`; `apps/web/CLAUDE.md` under 60 lines
- [x] T004 (9) Port the chat service's four browser test files to the React console
  (8 / 8 pass; three more lost features found and restored: F-05–F-07; F-08)
- [ ] T005 (3) "Changed underneath you" in the drawer
  **Deferred:** no React page gives the drawer a screen context (the Screen page has none; "This
  page" is disabled there), so nothing can change underneath it; what a 2.0 screen's context is
  (a variant? its revision?) is for the designer and the owner first
- [x] T006 (7) Off-tree arc labels spread over the top row
- [x] T010 code-reviewer, roadmap, glossary, changelog, merge
