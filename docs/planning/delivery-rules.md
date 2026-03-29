# Delivery Rules — PORTAL Planning and Execution

> **HISTORICAL DOCUMENT** — Written 2026-03-22 when PORTAL (read-only) and PORTAL_staging (active) were separate repositories.
> As of ADR-022 (March 2026), staging was consolidated into PORTAL. PORTAL is now the single canonical repo.
> Sections 1, 2, 6.1, 6.3, and 10 reflect the old two-repo model. The workflow principles (review before code, feedback loops, approval gates) remain valid.

_Status: v2 — updated 2026-03-22 (historical note added 2026-03-29)_

## Purpose

This document defines how work should proceed from this point onward so that the portal can evolve safely and predictably.

It exists to prevent accidental damage to the current working system and to create a disciplined path from planning to implementation.

---

## 1. Core Principle

> **Note (2026-03-29):** This section was written before ADR-022 consolidation. The two-repo model is no longer in effect.
> **Current model:** PORTAL is the single canonical repository. All implementation work happens directly here.

The portal has one canonical repository: `G:/01_OPUS/Projects/PORTAL`.
Implementation, review, and deployment all happen in this repository.
The main branch auto-deploys to https://portal.kamanin.at via Vercel.

---

## 2. Environment Rules

## 2.1 Original folder

### Status
Read-only by rule.

### Allowed
- inspect files
- review code
- analyze structure
- compare behavior
- extract planning context

### Not allowed
- edit files
- delete files
- move files
- rename files
- cleanup in place
- experimentation

### Reason
This folder currently represents the safest working baseline.
We do not risk destabilizing it during planning.

---

## 2.2 Staging folder

### Status
Active implementation surface (since March 2026). 15+ commits landed. All modules under active development.

### Allowed
- cleanup
- documentation alignment
- refactoring
- feature work
- experiments
- tests
- structured development work

### Rule
All changes happen only in staging.

---

## 3. Phase Order

## Phase 1 — Analytical phase (COMPLETE)

### Deliverables (delivered)
- Current State Map
- Domain Model v1
- Product Gap List
- Delivery Rules

---

## Phase 2 — Staging creation (COMPLETE)

- Staging copy created from original portal folder
- Original frozen as read-only reference
- Staging established as only working surface

---

## Phase 3 — Controlled implementation (ACTIVE)

Active since March 2026. Work includes:
- cleanup
- product completion work (tickets Phase 3.5, projects Phase 3.6)
- docs alignment
- tests
- architecture improvements

---

## Phase 4 — Hardening and expansion (STARTED)

- ClickUp integration hardening (webhook reliability, public thread routing)
- Support page and chat surface
- Project panel foundation
- Client memory / context design (planned)

---

## 4. Decision Rules

## 4.1 Human decision authority

Final product and implementation decisions belong to Yuri.

### Meaning
No autonomous execution of important changes without approval.

### Applies to
- architecture changes
- domain model changes
- product behavior changes
- credits logic
- memory model decisions
- cleanup that may affect working behavior

---

## 4.2 Planning before implementation

Before coding important work, there should be a clear short planning artifact or task description that states:
- problem
- target result
- affected modules
- risks
- recommendation

This can be lightweight, but it must exist.

---

## 4.3 Review before merge-level acceptance

Any significant implementation should be reviewed before being considered accepted.

Review focus:
- architecture fit
- domain correctness
- regression risk
- data/integration impact
- user-flow impact

---

## 5. Priority Rules

## Current product priority
The portal should not expand in random directions.

### Priority order
1. complete tickets product surface
2. complete projects product surface
3. design and introduce client memory/context layer
4. design credits model properly
5. then move to further enhancements

### Explicit non-priority for now
- AI-first portal features
- autonomous in-portal agents
- speculative advanced automation inside the product

---

## 6. Documentation Rules

## 6.1 Planning docs location

Planning docs live in-repo at:
`docs/planning/` (within `G:/01_OPUS/Projects/PORTAL`)

### Current files
- `current-state-map.md`
- `domain-model-v1.md`
- `product-gap-list.md`
- `delivery-rules.md` (this file)
- `team-operating-model-v1.md`

Historical note: planning docs originated in `C:\Users\upan\.openclaw\workspace\portal-planning\` and were migrated into the repo.

---

## 6.2 Documentation intent

Planning docs are working documents for:
- decision clarity
- roadmap clarity
- staging preparation
- future agent coordination

They should remain separate from the original portal until staging workflow is established.

---

## 6.3 Source-of-truth rule

> **Note (2026-03-29):** Updated to reflect single-repo model after ADR-022 consolidation.

PORTAL is the single canonical repository:
- `PORTAL` code + `docs/planning/` = unified source of implementation and planning truth
- main branch = production-deployed state
- Feature branches / PRs = staging equivalent (Vercel preview URLs auto-generated per PR)

---

## 7. Execution Rules for Agent Team

## 7.1 Agent roles are external to the portal product

Agents are part of the development/delivery system around the portal, not a portal feature.
Agent definitions live in `.claude/agents/` as Claude Code agent files.

---

## 7.2 Supervisor model

The lead Claude Code session acts as supervisor and coordinates work:
- sets order
- delegates analysis/review/build work via the Agent tool
- maintains coherence
- prevents conflicting implementation
- keeps the human informed with brief operational updates during execution without pausing the workflow unnecessarily
- keeps a continuous overview visible in the main messaging thread during active execution so status does not need to be pulled manually
- performs recurring supervisor checkpoints during long-running automatic execution (target cadence: about every 5 minutes, and no worse than every 10) to verify real task status and dashboard accuracy

---

## 7.3 Agent roles (active)

Defined in `.claude/agents/`:
- `reviewer-architect.md` — independent engineering critic and architecture gate
- `implementation-agent.md` — builds scoped changes in staging
- `qa-agent.md` — independent verification layer
- `docs-memory-agent.md` — maintains context integrity, updates docs

Invoked via Claude Code Agent tool from the lead session.
Workflow discipline governed by CLAUDE.md Handoff Rules.
Dashboard at `tasks/dashboard.md`.

### Rule
These roles support work around the portal; they do not replace human approval.

---

## 7.4 Approval boundary

No important code or product change should be treated as implicitly approved.

### Especially true for
- data model changes
- project/ticket model changes
- memory model changes
- credits logic
- cleanup that changes active behavior

## 7.5 Workflow continuity is mandatory

Execution must not stall between already-defined phases.

That means:
- once a phase verdict exists, the next role must be triggered immediately unless a real approval boundary or architecture blocker exists
- dashboard status must reflect real execution state, not intended next state
- repeated silent gaps between phases count as workflow failure
- side conversations or parallel tasks must not cause the main workflow to be forgotten or left unadvanced
- reporting a verdict without also launching the next already-defined step counts as workflow failure
- the team should optimize for continuous supervised flow, not passive status-holding

---

## 8. Safe Working Rules

## 8.1 Do not mix analysis and implementation

Current planning work should remain planning work.
Implementation starts only after staging is created.

---

## 8.2 Do not clean the original repo in place

Even if cleanup is obviously needed, it should happen only in staging.

---

## 8.3 Do not add major features before domain clarity

Especially for:
- client memory/context
- credits
- approval surfaces

These require explicit model clarity first.

---

## 9. Immediate Next Steps

### Next step 1
Accept the analytical document set.

### Next step 2
Create staging copy from the original portal folder.

### Next step 3
Use staging for:
- cleanup
- doc alignment
- product completion work

### Next step 4
Then start actual implementation planning module by module.

---

## 10. Current Operating Model (updated 2026-03-29)

After ADR-022 consolidation, the operating rule is:

- `G:/01_OPUS/Projects/PORTAL` = canonical single repository (code + planning docs)
- `main` branch = production (auto-deployed to portal.kamanin.at)
- PRs/feature branches = get Vercel preview URLs (replaces staging branch)
- `docs/planning/` = direction and coordination truth (historical planning documents remain for reference)

The workflow principles from this document remain valid: review before code, feedback loops, no self-approval.
