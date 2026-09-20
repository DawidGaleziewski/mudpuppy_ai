### BA domain knowladge
This project should fallow principles of BA domain knowledge. Best tractices etc. Such as:

How an expert BA documents an existing system
The core idea

What you're describing is usually called as-is analysis or reverse-engineering requirements (sometimes "brownfield documentation" or "requirements recovery"). The key difference from greenfield BA work is that the system already exists, so the code and behavior are the source of truth for what it does, but not for why it does it. A good BA keeps those two separate:

Observed behavior (verifiable from code, UI, data)
Intent / business rationale (only knowable from people, docs, or inference, and must be flagged as such)

This distinction is the most important thing to build into your harness.

How an expert BA would approach it
Scope and context. Identify stakeholders, system boundaries, and the purpose of the documentation (onboarding, migration, audit, compliance, rewrite?). The purpose determines the depth.
Discovery. Read existing docs, walk through the UI, review the code and database schema, look at logs and support tickets, and interview users and SMEs.
Decomposition. Break the system into business capabilities, then processes, then use cases, then business rules.
Modeling. Produce diagrams and structured artifacts (see below).
Validation. Walk the drafts back to stakeholders. Most BA work is here: "Is this actually how it works?"
Traceability and maintenance. Link requirements to their sources and keep them versioned.
Typical deliverables
Business Requirements Document (BRD): the why, goals, and scope, at the business level.
Functional Requirements Document (FRD) / Software Requirements Specification (SRS): what the system does. SRS is the more technical, IEEE 830 / ISO 29148 flavor.
Process maps (as-is): flow diagrams of how work moves through the system and people.
Use case specifications: actor, preconditions, main flow, alternate flows, exceptions, postconditions.
Business rules catalog: discrete rules like "orders over €10k need manager approval."
Data dictionary and domain/glossary: entities, fields, definitions, and the business vocabulary.
Non-functional requirements (NFRs): performance, security, availability, audit, compliance.
Traceability matrix (RTM): requirement ↔ source (code, screen, person) ↔ test.
Gap analysis: as-is vs. to-be, if there's a future-state goal.
Open questions / assumptions / risks log.
Terms worth knowing

Analysis concepts

As-is / to-be: current state vs. desired future state
Actor / stakeholder / persona: who interacts with or cares about the system
Business rule vs. functional requirement: a rule is a policy constraint ("refunds only within 30 days"); a requirement is system behavior that enforces it
Business capability: what the org does, independent of how (e.g., "Invoicing")
Acceptance criteria: testable conditions for a requirement being satisfied
Traceability: being able to link every statement back to its evidence
Elicitation: gathering info from people and artifacts
SME (Subject Matter Expert): the person who actually knows the domain
Happy path / alternate flow / exception flow: the main scenario and its variations

Prioritization and quality

MoSCoW: Must/Should/Could/Won't
INVEST: qualities of a good user story (Independent, Negotiable, Valuable, Estimable, Small, Testable)
Ambiguity, completeness, consistency, verifiability: the classic quality attributes of a requirement
Methodologies, frameworks, and notations
BABOK Guide (IIBA): the BA "bible." It defines knowledge areas such as Elicitation & Collaboration, Requirements Life Cycle Management, Strategy Analysis, and Requirements Analysis & Design Definition. Even skimming its structure gives you the vocabulary.
BPMN 2.0: the standard notation for process diagrams (swimlanes, gateways, events). It's what most BAs expect for process maps.
UML: use case diagrams, activity diagrams, sequence diagrams, state machine diagrams, class/ER diagrams.
SIPOC: a high-level process summary (Suppliers, Inputs, Process, Outputs, Customers).
User stories and Gherkin (Given/When/Then): common output formats, and Gherkin doubles as executable acceptance criteria.
Use cases (Cockburn style): more formal than stories, and better for documenting existing behavior.
Domain-Driven Design (DDD): bounded contexts, ubiquitous language, and aggregates. Very useful for structuring legacy system documentation.
Event Storming: a workshop technique for discovering domain events and flows. Also a good mental model for extracting events from code.
Decision tables / decision trees (DMN): the best way to document complex conditional business rules.
RACI: who is Responsible, Accountable, Consulted, Informed.
C4 model: context, container, component, and code diagrams for architecture-level documentation.
Gap analysis, SWOT, root cause analysis (5 Whys), process mining: supporting analysis techniques.
What this means for your harness

Since you're a developer, the design implications matter more than the BA theory:

Evidence-based output. Every requirement should cite its source (file:line, endpoint, DB table, UI screen). This is the traceability principle, and it's your best defense against hallucination.
Confidence and provenance labels. Tag statements as Observed (directly in code), Inferred (reasonable deduction), or Needs confirmation (business intent). Claude can see that a discount is applied at 15%. It cannot know why 15%.
Open questions as a first-class output. An expert BA's most valuable artifact is often the list of questions for SMEs. Make the harness generate these deliberately rather than guess.
Layered, multi-pass pipeline. Mirror the BA workflow: inventory (routes, screens, entities, jobs) → capability map → per-process deep dives → business rules extraction → NFRs → synthesis. Single-shot "document this app" prompts produce shallow, inconsistent results.
Structured intermediate formats. Have Claude emit JSON/YAML for rules, entities, and flows, then render to Markdown, Mermaid (BPMN-ish flows, sequence, ER), or Gherkin. This keeps documents consistent and diffable.
Controlled vocabulary. Build and maintain a glossary/ubiquitous language across passes, so "customer," "client," and "account holder" don't drift.
Human-in-the-loop validation. Design a review step where BAs confirm, correct, or reject items, and feed corrections back in. That mirrors real elicitation.
Audience-specific views. The same underlying model can render as a BRD for stakeholders, an SRS for devs, and a rules catalog for compliance.
Watch for code-only blind spots. Manual processes, workarounds outside the system, config in third-party tools, and tribal knowledge won't appear in code. Your tool should explicitly state what it couldn't see.
Suggested starting points
Skim the BABOK v3 knowledge area names and the techniques list (Chapter 10).
Look at a sample use case spec (Cockburn's Writing Effective Use Cases) and a sample SRS (ISO/IEC/IEEE 29148 outline).
Learn Mermaid for diagrams, since it's text-based and LLM-friendly.
Talk to one or two BAs about what their real deliverables look like; templates vary a lot by company and industry.