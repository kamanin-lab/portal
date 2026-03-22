# Team Operating Model v1 — PORTAL

_Status: active working model — updated 2026-03-22_

## Purpose

This document defines how the minimal agent team works around the PORTAL project.

It is designed to prevent:
- linear low-quality pipelines
- self-approval by the same executor
- coding before thinking
- hidden regressions
- loss of architectural coherence

This is a **feedback-driven operating model**, not a simple handoff chain.

---

## 1. Core Principle

The team does not work as:

`task -> code -> done`

The team works as:

`understand -> critique -> implement -> review -> verify -> feedback -> revise if needed -> accept`

This means feedback loops are required both:
- **before coding**
- **after coding**

---

## 2. Team Composition (Minimal Active Team)

## 2.1 Supervisor / Orchestrator

### Role
Primary coordinator of work.

### Responsibility
- chooses priority
- defines scope
- assigns roles
- decides when another feedback round is needed
- preserves coherence between product, architecture, implementation, and QA
- gives final acceptance or sends work back for revision

### Current assignment
- Lead Claude Code session acts as supervisor
- Agent roles defined in `.claude/agents/` directory

---

## 2.2 Senior Engineer Reviewer / Architect

### Role
Independent engineering critic and architecture gate.

### Responsibility
- reviews the approach before coding
- evaluates technical direction
- identifies architecture risks
- challenges weak assumptions
- reviews implementation results after coding
- gives explicit feedback and recommendations

### Rule
This role is not the primary implementer for the same task.

---

## 2.3 Implementation Agent

### Role
Builds the change in the staging repository.

### Responsibility
- executes scoped implementation work
- updates code, tests, and related docs where needed
- stays within the approved scope
- does not self-accept the result

### Rule
Implementation happens only in staging.

---

## 2.4 QA / Verification Agent

### Role
Independent verification layer.

### Responsibility
- checks expected behavior
- checks regressions
- runs tests/build where relevant
- validates user flow completeness
- reports mismatches between requested and actual result

### Rule
QA is not reduced to just running one command.
It must include behavioral verification.

---

## 2.5 Docs / Memory Agent (Optional / On-Demand)

### Role
Maintains context integrity.

### Responsibility
- updates planning or implementation docs
- records decisions
- keeps source-of-truth aligned
- reduces context loss across tasks and sessions

### Use when
- task changes architecture
- task changes domain model
- task introduces new product rules
- important implementation decisions need to be preserved

---

## 3. Working Environment Rules

## 3.1 Original repository
- `G:/01_OPUS/Projects/PORTAL`
- frozen read-only reference
- no implementation work

## 3.2 Active repository
- `G:/01_OPUS/Projects/PORTAL_staging`
- active implementation surface (since March 2026, 15+ commits)
- only place for implementation work

## 3.3 Planning artifacts
- `docs/planning/` (in-repo, within `PORTAL_staging`)
- source of planning and coordination truth
- Historical note: migrated from `C:/Users/upan/.openclaw/workspace/portal-planning/`

---

## 4. Feedback Loops

## 4.1 Pre-Code Feedback Loop

This loop happens before implementation starts.

### Steps
1. Supervisor defines task and scope
2. Reviewer/Architect critiques the proposed approach
3. If risks or weak assumptions exist, the task returns for another planning pass
4. Only after the approach is considered acceptable does coding begin

### Goal
Prevent bad implementation from starting too early.

---

## 4.2 Post-Code Feedback Loop

This loop happens after implementation exists.

### Steps
1. Implementation Agent completes the scoped work
2. Reviewer evaluates code quality and architecture fit
3. QA validates actual behavior and regression safety
4. If issues are found, work goes back for revision
5. Supervisor decides whether to accept or require another round

### Goal
Prevent weak code from being accepted because it "mostly works"

---

## 4.3 Multi-Round Rule

For non-trivial tasks, multiple feedback rounds are normal.

### Allowed and expected
- more than one planning/review round before coding
- more than one revision round after coding
- targeted re-review after fixes

### Not acceptable
- treating the first implementation pass as final by default
- accepting unreviewed or self-approved work

---

## 5. Acceptance Rules

## 5.1 Final acceptance authority
Final acceptance belongs to the Supervisor.

## 5.2 A task is not complete unless
- the scope is satisfied
- architecture concerns are addressed
- QA confirms expected behavior
- tests/build pass when applicable
- no blocking review concerns remain

## 5.3 No self-acceptance
The implementation role cannot be the only judge of completion.

---

## 6. Task Routing Rules

## Small task
Use when:
- low architectural risk
- narrow scope
- isolated change

### Default flow
Supervisor -> Reviewer quick check -> Implementer -> QA -> Supervisor accept

---

## Medium task
Use when:
- touches a real module flow
- affects state or UX behavior
- may introduce regressions

### Default flow
Supervisor -> Reviewer pre-code -> Implementer -> Reviewer post-code -> QA -> Supervisor accept/revise

---

## Large task
Use when:
- touches architecture
- changes domain model
- changes multiple modules
- affects external integrations

### Default flow
Supervisor -> Reviewer/Architect deep pass -> possible second planning loop -> Implementer -> Reviewer -> QA -> second fix loop if needed -> Supervisor accept

---

## 7. Role Boundaries

## Supervisor does not
- blindly code everything directly by default
- skip review to move faster
- accept unclear work

## Reviewer does not
- quietly become the coder for the same task unless explicitly reassigned
- replace QA

## Implementer does not
- redefine the task unilaterally
- self-approve
- ignore repo rules and source-of-truth docs

## QA does not
- stop at "tests passed"
- substitute architecture review

---

## 8. Documentation / Source-of-Truth Rules

For every important task, relevant reference docs must be consulted first.

### Mandatory examples
- ClickUp work -> `.claude/skills/clickup-api/SKILL.md`
- Supabase work -> `docs/reference/supabase-context-hub/`
- React / Tailwind / Vite / Vitest work -> `docs/reference/context-hub/`

If Context Hub coverage exists, use it first.
If it does not exist, use official documentation directly.

---

## 9. Initial Task Selection for This Model

The first recommended area to run under this operating model is:

## Phase 4.1 — Tickets Completion

Why:
- high product value
- already a mature module
- enough surface for meaningful review loops
- good place to establish a team rhythm without jumping straight into the most complex domain changes

After that:
- Phase 4.2 — Projects Completion
- Phase 4.3 — Client Memory / Context Design
- Phase 4.4 — Credits Preparation

---

## 10. Practical Workflow Template

For each meaningful task, use this sequence:

### Step 1 — Task framing
- problem
- target outcome
- affected modules
- risks
- constraints

### Step 2 — Pre-code review
- architecture fit
- alternatives
- likely weak points
- recommendation

### Step 3 — Implementation
- code changes in staging only
- tests/docs updates where relevant

### Step 4 — Post-code review
- code quality
- architecture fit
- maintainability

### Step 5 — Verification
- tests/build
- user flow
- regression check

### Step 6 — Acceptance or another loop
- accept
- revise
- escalate for deeper redesign

---

## 11. Claude Code Adaptation

The team operating model described above is now executed natively within Claude Code.

### Agent definitions
Agent roles are defined as markdown files in `.claude/agents/`:
- `reviewer-architect.md` — Senior Engineer Reviewer / Architect (Section 2.2)
- `implementation-agent.md` — Implementation Agent (Section 2.3)
- `qa-agent.md` — QA / Verification Agent (Section 2.4)
- `docs-memory-agent.md` — Docs / Memory Agent (Section 2.5)

### Supervisor execution
The lead Claude Code session fills the Supervisor / Orchestrator role (Section 2.1). It:
- frames tasks and defines scope
- invokes specialist agents via the Claude Code Agent tool
- collects verdicts and routes work through feedback loops
- maintains the dashboard at `tasks/dashboard.md`

### Workflow discipline
- Handoff rules and repo conventions governed by `CLAUDE.md`
- Agent invocations follow the feedback loop model (Sections 4.1, 4.2)
- Dashboard reflects real execution state, not intended next state

### Relationship to earlier tooling
This model replaces the earlier OpenClaw supervisor/subagent approach. The core workflow principles (feedback loops, no self-approval, review before merge) remain unchanged; only the execution environment has changed.

---

## 12. Immediate Conclusion

The PORTAL team should now operate as a **minimal specialist team with mandatory evaluation loops**, not as a linear execution pipeline.

The model is intentionally small:
- Supervisor
- Reviewer/Architect
- Implementer
- QA
- Docs/Memory when needed

This is enough to create quality pressure, specialization, and feedback without creating organizational overhead too early.
