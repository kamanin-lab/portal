# Product Gap List — KAMANIN Portal

_Status: draft v1_

_Updated 2026-03-22: Several gaps closed since initial writing. See inline status updates._

## Purpose

This document lists the major product gaps between the **current portal state** and the **target of a truly usable client portal**.

It is not a backlog of tiny tasks. It focuses on the meaningful gaps that block product completeness.

---

## 1. Tickets Module Gaps

## 1.1 Completion confidence gap

### Current state
Tickets appears to be the most mature module, but we do not yet have a final confirmed definition of “done”.

### Gap
The module is strong, but product completeness is not yet formally declared.

### What likely needs confirmation
- all core ticket states work correctly
- filters align with real user needs
- comments/support flow is stable
- create-task flow is complete
- unread/notification behavior is trustworthy
- empty/error/loading states are acceptable

### Why it matters
Tickets is currently the strongest candidate for a production-grade core workflow. It should become the first module that is fully “locked in”.

---

## 1.2 User-flow completeness gap

### Gap
The tickets module may already have many parts, but it still needs a full user-flow verification:
- open portal
- see tasks
- filter them
- inspect details
- comment
- support communication
- create new task
- track status change

### Why it matters
A module is only complete if the entire loop works cleanly, not if the component list looks complete.

---

## 1.3 Product language / business clarity gap

### Gap
Status handling is technically disciplined, but we still need to ensure that the ticket module expresses the right client-facing meaning.

### Examples
- what exactly is "needs attention" from the client perspective?
- where is the difference between support request and project task?
- which actions should a client be able to take directly?

### Why it matters
A client portal succeeds or fails on clarity, not just data correctness.

---

## 2. Projects Module Gaps

## 2.1 Project workspace completeness gap

### Current state
Projects is real and connected to live data, but not yet clearly a finished project workspace.

### Gap
The module needs a sharper answer to:
- what exactly is the main project overview experience?
- what actions are available there?
- what should be visible at chapter level vs step level?
- what is still a placeholder or partial implementation?

### Why it matters
Projects is strategically important. It should become the second strong pillar after tickets.

---

## 2.2 Navigation / route completeness gap

### Gap
Projects routing and workspace structure still look less mature than they could be.
The structure exists, but the user experience of a fully coherent project area is not yet obviously complete.

### Why it matters
If the module grows further without navigation clarity, later additions will feel bolted on.

---

## 2.3 Read-model / summary quality gap

### Gap
The project experience relies on transformed/cache-based read models, but some high-value summaries and counts still seem to be assembled in a relatively expensive and fragile way.

### Why it matters
This affects both correctness and future performance.

---

## 2.4 Storytelling gap

### Gap
Projects already have narratives, chapters, and enrichment, but the full customer-facing project story layer likely still needs refinement.

### Why it matters
The project module should not look like ClickUp in costume. It should feel like a curated client-facing delivery experience.

---

## 3. Client Memory / Context Gaps

## 3.1 No first-class memory layer yet

### Gap
There is currently no confirmed finished product surface for client memory/context.

### Needed
A designed context layer that can store:
- client profile facts
- constraints
- preferences
- recurring rules
- important decisions
- project-specific context
- commercial notes where appropriate

### Why it matters
Without this, the portal will remain operationally weaker than it could be, even before any AI is added.

---

## 3.2 No clear distinction yet between client-level and project-level context

### Gap
We need to explicitly distinguish:
- account-wide durable knowledge
- project-specific durable knowledge
- ticket-level conversation history

### Why it matters
Without this distinction, memory becomes messy and hard to trust.

---

## 4. Credits / Commercial Logic

> **Status update (2026-03-29):** Phase 1 of the credit system is **IMPLEMENTED** (TASK-010).

## 4.1 Core credit system — IMPLEMENTED

### What was built (TASK-010)
- `credit_packages` and `credit_transactions` database tables
- `CreditBalance` (sidebar display), `CreditBadge`, `CreditApproval` components
- `credit-topup` Edge Function (pg_cron monthly topup)
- `useCreditHistory` and `useCredits` hooks
- ClickUp credits custom field → `task_cache.credits` via webhook
- `send-reminders` for pending credit approvals

### Remaining commercial logic gaps
- Credit estimation workflow (pre-work approval)
- Usage reconciliation / invoicing surface
- Multi-package or rollover logic
- Commercial reporting / history export

### Why it matters
Core credit infrastructure is live. Advanced commercial workflow is a future phase.

---

## 5. Documentation / Source-of-Truth Gaps

## 5.1 README gap

### Gap
The root README does not describe the actual project.

### Why it matters
This creates unnecessary ambiguity for future execution.

---

## 5.2 Consolidation gap

**Status: IMPROVED.** docs/STATUS.md, docs/WORKING_GUIDE.md, docs/REPOSITORY_MAP.md now exist.

### Gap
Documentation exists, but still needs consolidation into a cleaner working set.

### Why it matters
Planning and implementation speed depend on trustworthy docs.

---

## 5.3 Current/live/planned matrix gap

### Gap
We still need one clear reference that says:
- what is live
- what is partial
- what is planned

### Why it matters
Without this, prioritization becomes fuzzy.

---

## 6. Engineering Support Gaps

## 6.1 Test protection gap

### Gap
Tests exist, but are not yet strong enough around critical product flows.

### Why it matters
Without stronger test protection, delivery speed will remain artificially constrained by fear of regressions.

---

## 6.2 Performance hardening gap

### Gap
The project module in particular will need future read-path consolidation and aggregation improvements.

### Why it matters
Better to identify and plan this now than react later under pressure.

---

## 6.3 Repository clarity gap

**Status: IMPROVED.** Historical code archived in `archive/legacy-reference/`.

### Gap
Historical layers and current structure still need cleanup/marking.

### Why it matters
This affects delivery clarity more than end-user product behavior, but it is still a meaningful execution blocker.

---

## 7. Workflow / Delivery Gaps

## 7.1 Staging work surface

**Status: CLOSED.** Single-repo model adopted (ADR-022, March 2026). PORTAL_staging was merged into PORTAL.
Feature branches + Vercel preview URLs serve as the staging equivalent for PRs.

### Current model
All development happens in `G:/01_OPUS/Projects/PORTAL` (canonical single repo).
PRs auto-generate Vercel preview URLs. Production deploys from `main`.

---

## 7.2 No finalized delivery rules yet

**Status: PARTIALLY CLOSED.** Delivery rules documented in `docs/planning/delivery-rules.md`. Agent team defined in `.claude/agents/`.

### Gap
We still need explicit rules for:
- original vs staging
- planning before coding
- review before implementation
- who approves changes
- how agent roles will be used later

### Why it matters
This is essential before scaling execution.

---

## 8. Prioritized Gap Summary

## Highest priority gaps
1. finish product understanding of tickets
2. finish product understanding of projects
3. define client memory/context model
4. define delivery rules and staging boundary

## Important but next-layer gaps
5. define credits domain model
6. improve test protection on critical flows
7. improve repo/docs clarity
8. harden performance-sensitive read paths

## Later gaps
9. advanced automation support
10. richer AI-assisted layers
11. extended account intelligence and reporting

---

## 9. Phase 4 — Current Work (added 2026-03-22)

Phase 4 is now underway, focusing on:

- **Project memory / client context:** building the foundation for per-client and per-project knowledge that agents and the portal can reference
- **ClickUp integration hardening:** stabilizing webhook routing, public thread handling, and sync reliability
- **Project Experience module completion:** shipping the project panel foundation (batch 1 landed in `f32db82`)

This phase builds on the completed Phases 1-3 (planning, domain clarity, staging setup, tickets module, projects module foundation).

---

## 10. Immediate Conclusion

The portal does not need a restart.
It needs **focused completion of its unfinished product layers**.

The next planning effort should therefore prioritize:
1. tickets completeness
2. projects completeness
3. client memory/context design
4. delivery/staging rules
5. only then credit system design in implementation terms
