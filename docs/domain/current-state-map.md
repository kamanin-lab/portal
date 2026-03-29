# Current State Map — KAMANIN Portal

_Status: draft v1_

_Updated 2026-03-22: Staging repository is now active. Phases 1-3 complete. Phase 4 (project memory, integration hardening) started._

## Purpose

This document captures the **current actual state** of the portal as a product and system.
It is not a vision document and not a future roadmap. It exists to answer:

- what already exists
- what is partially implemented
- what is only planned
- what appears to be source of truth
- where the main risks and ambiguities are

---

## 1. System Overview

### Current characterization
The portal is already a **real working application**, not just a prototype.
It has:

- a Vite + React + TypeScript frontend
- Supabase-backed data access
- Edge Functions for ClickUp-facing actions
- a tickets/support module
- a projects module
- architectural documentation and ADRs

### Current development state
The portal appears to be in a **transition from strong foundation to product completion**.
The core is present, but several areas are not yet fully consolidated as a finished product.

---

## 2. Repository / Codebase Shape

### Main app structure
Observed major areas:

- `src/` — main application
- `supabase/functions/` — Edge Functions
- `docs/` — architecture, decisions, ideas, context

### Historical / legacy signals
The repository still shows signs of earlier layers / prior structure.
This means the project is technically advanced enough to work, but not yet fully cleaned into a single crystal-clear engineering artifact.

### Current assessment
- **App exists and is usable**
- **Architecture is intentional**
- **Repository clarity is not final**

---

## 3. Product Modules

## 3.1 Tickets / Support

### Current state
This appears to be the most mature module.

### Observed capabilities
- task listing
- filtering
- search
- task detail sheet
- comments
- support communication
- notifications
- task actions
- cached task loading
- realtime invalidation patterns

### Current assessment
- **Exists:** yes
- **Works:** yes, substantially
- **Complete:** not yet fully confirmed
- **Confidence:** high that this is the strongest module right now

---

## 3.2 Projects

### Current state
The projects module is real and connected to live data, not just mock UI.

### Observed capabilities
- project overview
- chapter/phase-based structure
- task-to-step transformation
- project context strip / hero / timeline style experience
- project task cache
- enrichment layer for project steps
- message / upload / step sheet surfaces

### Current assessment
- **Exists:** yes
- **Works:** yes, partially to strongly
- **Complete:** no, not yet fully product-complete
- **Confidence:** strong foundation, but still unfinished as a full project workspace

---

## 3.3 Client Context / Memory

### Current state
This is not yet established as a first-class product layer.

### Observed state
- memory/context is recognized as important
- docs/ideas suggest awareness of the need
- there is no confirmed finished product layer for client memory yet

### Current assessment
- **Exists:** conceptually
- **Works:** not yet as a finished module
- **Complete:** no
- **Priority:** high for future product completion

---

## 3.4 Credits / Commercial Logic

### Current state
This is a future product area, not yet implemented as a finalized system.

### Current assessment
- **Exists:** conceptually
- **Works:** no confirmed implementation yet
- **Complete:** no
- **Priority:** important, but after tickets/projects clarity and memory/context design

---

## 4. Data / Integration Architecture

### Observed architecture
Data flow currently follows a good pattern:

- browser reads from Supabase-side cache/data tables
- browser does not directly call ClickUp
- Edge Functions act as action/integration boundary
- webhook/update patterns exist

### Strengths
- strong separation of UI and external API integration
- good basis for maintainability
- good basis for future controlled automation

### Risks
- some read paths are still expensive / layered
- some sync logic is operationally fragile
- project read model likely needs future consolidation

---

## 5. Documentation State

### Observed state
Documentation exists and is meaningful.
There are architecture docs, decisions, changelog/history, and idea/context documents.

### Current assessment
- **Docs exist:** yes
- **Docs are useful:** yes
- **Docs are fully consolidated:** not yet
- **README is current:** no

### Risk
Documentation and implementation appear directionally aligned, but not yet fully synchronized into one clean source-of-truth layer.

---

## 6. Engineering Quality Snapshot

### Strengths
- intentional module structure
- clear effort to normalize status/data handling
- use of transforms and dedicated hooks
- ADR discipline
- signs of good engineering judgment in integration boundaries

### Weak points
- business logic beginning to spread across hooks, transforms, and UI
- some important invariants still depend on comments/conventions
- test coverage exists but is not yet strong enough for this product stage
- performance risks already visible in project data assembly and sync paths

---

## 7. What Is Clearly Live vs Partial vs Planned

## Live / materially implemented
- frontend shell
- auth-protected structure
- tickets/support core
- project module foundation
- Supabase integration
- Edge Functions integration layer
- architectural docs / ADRs
- repository clarity / cleanup (archive/legacy-reference established, docs organized)

## Partial / unfinished
- projects as a fully completed client workspace
- test protection for critical flows
- client memory/context as a product layer
- performance hardening of project read path

## Planned / future-oriented
- credits-based commercial/task accounting
- richer client memory/context model
- later advanced automation / agent-supported development workflow

---

## 8. Source-of-Truth Assessment

### Likely current source-of-truth layers
- runtime product behavior: code in main app + Supabase layer
- architectural intent: `docs/ARCHITECTURE.md` + `docs/DECISIONS.md`
- actual implementation truth: current root application structure

### Current concern
The project has source-of-truth material, but it is not yet consolidated enough to remove ambiguity for future fast execution.

---

## 9. Current Main Risks

1. **Adding new features before consolidating the model**
2. **Letting tickets/projects grow without a clear domain backbone**
3. **Introducing client memory and credits without domain design first**
4. **Working directly in the original project folder during implementation**
5. **Speeding up development without stronger documentation/test clarity**

---

## 10. Immediate Conclusion

The portal is already a strong base and should be treated as a product worth continuing — not restarting.

At the same time, it is not yet in a state where uncontrolled feature growth would be safe.

### Progress against the original recommended order:
1. ~~finish analytical phase documents~~ — **COMPLETE**
2. ~~define domain clarity~~ — **COMPLETE**
3. ~~create staging copy~~ — **COMPLETE** then **CONSOLIDATED** (ADR-022: PORTAL_staging renamed to PORTAL, single canonical repo)
4. continue implementation — **IN PROGRESS** (Phase 4: project memory, ClickUp hardening)

---

## 11. Open Questions for the Next Documents

The next planning documents should answer:

- What exactly is the domain model v1?
- What is unfinished in tickets?
- What is unfinished in projects?
- What should client memory contain?
- How should credits fit into the model?
- What are the working rules for original vs staging?
