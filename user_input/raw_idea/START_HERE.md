# pathfinder-ai
This tool is supposed to be used by BA.

Main assumptions:
Project uses BA domain expertiese and good practices to document existing brownfield apps. So that app could be i.e re-created with other agents using itsd documentation in newer tech stack (migration).

## subagents and separation of cocnerns
### BA
BA never browses. It works only from what the explorer recorded. If it needs more evidence, it writes a follow-up task for the explorer ("check what happens when the cart is empty at checkout"). That keeps every claim traceable to a recorded step. BA also owns the assumptions and open-questions log.
More on what good BA should look like. What knowladge he should posses in /agents/ba.md

### crawler
Crawler records, it doesn't interpret. Its output should be observed facts: steps, states, network calls, outcomes, plus a small number of rule_candidates flagged as inferred. If it starts writing "the business requires...", you've lost the observed vs. intent split. Have it also emit open questions ("why is this button disabled for guests?") rather than guessing.
More on what good crawler should look like. What knowladge he should posses in /crawler.md


### QA
QA only generates acceptance tests from confirmed requirements. Characterization tests can come from verified process recordings alone. The QA agent should also own the helper library (components, fixtures, obstacle handlers) and reuse it before creating new pieces.

More on what good QA should look like. What knowladge he should posses in /QA.md


## Techstack