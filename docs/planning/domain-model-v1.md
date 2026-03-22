# Domain Model v1 — KAMANIN Portal

_Status: draft v1_

## Purpose

This document defines the **core product entities and relationships** that should anchor дальнейшее развитие портала.

Goal: stop feature growth from becoming accidental and ensure that tickets, projects, client memory, and future credits fit into one coherent system.

This is not yet a DB schema. It is a **product + domain model**.

---

## 1. Core Modeling Principles

1. **Client-facing portal first** — model should support a real working portal before any advanced AI layers.
2. **Projects and tickets must belong to one business system** — not two parallel universes.
3. **Client context/memory is a first-class entity** — not random notes.
4. **Credits must attach to explicit business objects** — never be an informal overlay.
5. **Approval is a cross-cutting concern** — not a one-off UI trick.
6. **Original working portal remains untouched; implementation happens only later in staging.**

---

## 2. Core Entities

## 2.1 Client

### Purpose
Represents the customer/account level.

### Contains
- identity
- commercial relationship
- communication preferences
- global account context
- workspace access boundary

### Examples of fields
- client_id
- display_name
- legal_name
- initials
- primary_contacts
- account_status
- communication_language
- communication_tone
- billing_mode
- default_credit_rules

### Notes
A client can have multiple projects, multiple tickets, and one long-lived memory/context layer.

---

## 2.2 Workspace

### Purpose
Represents a visible module in the portal for a client.

### Current known examples
- tickets
- projects
- support
- future possible modules

### Contains
- module key
- visibility state
- display metadata
- activation/configuration per client

### Notes
Workspace is not the same thing as project. It is the client-visible entry point/module surface.

---

## 2.3 Project

### Purpose
Represents a client delivery stream or structured engagement area.

### Contains
- project identity
- project type
- time boundaries
- ClickUp list mapping
- chapter/phase structure
- project-level progress context

### Examples of fields
- project_id
- client_id
- name
- type
- start_date
- target_date
- clickup_list_id
- clickup_phase_field_id
- is_active

### Notes
A project belongs to exactly one client.
A client may have multiple projects.

---

## 2.4 Chapter / Phase

### Purpose
Represents a structural subdivision of a project.

### Contains
- ordering
- narrative context
- mapping to ClickUp phase/custom field option
- step grouping

### Examples of fields
- chapter_id
- project_id
- title
- sort_order
- narrative
- next_narrative
- clickup_cf_option_id
- is_active

### Notes
This is the bridge between raw task execution and curated project storytelling.

---

## 2.5 Ticket

### Purpose
Represents an actionable item in the tickets/support side of the portal.

### Contains
- task identity
- status
- priority
- due date
- comments/messages
- list/workspace context
- visibility status

### Examples of fields
- ticket_id / clickup_id
- client_id
- workspace_id or module context
- status
- priority
- due_date
- list_id
- list_name
- is_visible
- last_activity_at

### Notes
Tickets are not the same as project steps, but both are work objects and must eventually fit one domain language.

---

## 2.6 Project Step

### Purpose
Represents a task inside a project experience.

### Contains
- task identity
- derived step status
- enrichment content
- attachments
- comment count
- chapter membership

### Notes
Today this is effectively a transformed representation of project task cache rows.
Long-term it should remain a clear read-model concept, even if backed by task records.

---

## 2.7 Comment / Message

### Purpose
Represents discussion attached to a ticket or project-related work item.

### Contains
- author
- content
- timestamps
- portal/origin metadata
- attachments

### Notes
Comments are both an operational record and a source for future memory/context capture.

---

## 2.8 Client Memory / Context Entry

### Purpose
Represents durable account knowledge that should outlive a single ticket or message.

### Why it matters
This is not optional future AI decoration. It is an operational requirement.

### Should contain
- account preferences
- recurring rules
- business constraints
- approved decisions
- technical constraints
- communication style notes
- important commercial boundaries
- recurring support patterns

### Proposed categories
- `profile`
- `communication`
- `technical`
- `delivery`
- `commercial`
- `decision`
- `risk`

### Notes
Memory belongs at least at two levels:
- client-level memory
- project-level memory

---

## 2.9 Credit Ledger

### Purpose
Represents the future commercial/accounting model for work consumption.

### Important principle
Credits must not be modeled as a visual label only.
They need an explicit business model.

### Possible components
- credit account / balance
- credit transaction
- credit estimate
- credit approval
- credit consumption event
- credit adjustment

### Notes
Credits should connect to tickets/projects, but should remain their own accounting surface.

---

## 2.10 Approval Item / Decision Surface

### Purpose
Represents a decision that requires explicit user/client/operator confirmation.

### Can apply to
- status changes
- client-facing actions
- commercial decisions
- future credit approvals
- later AI/automation proposals

### Notes
Approval is a system concern, not just one button inside one module.

---

## 3. Entity Relationships

## Primary relationship map

- **Client**
  - has many **Workspaces**
  - has many **Projects**
  - has many **Tickets**
  - has many **Client Memory Entries**
  - has one or more future **Credit Accounts / Ledgers**

- **Project**
  - belongs to one **Client**
  - has many **Chapters/Phases**
  - has many **Project Steps**
  - has many **Project Memory Entries**
  - may generate **Approval Items**

- **Ticket**
  - belongs to one **Client**
  - may optionally relate to a **Project**
  - has many **Comments**
  - may generate **Approval Items**
  - may later link to **Credit Estimates / Transactions**

- **Project Step**
  - belongs to one **Project**
  - belongs to zero or one **Chapter**
  - may have many **Comments / Attachments**
  - may later have credit impact or approval relevance

- **Client Memory Entry**
  - belongs to one **Client**
  - may optionally relate to a **Project**
  - may optionally relate to a **Ticket**

- **Credit Ledger / Credit Transaction**
  - belongs to one **Client**
  - may reference a **Project**, **Ticket**, or another billable event

- **Approval Item**
  - references a subject entity
  - stores requested action, status, actor, and result

---

## 4. Immediate Modeling Decisions

## Decision 1
**Client memory is first-class.**
Not notes-in-comments, not future AI-only storage.

## Decision 2
**Credits are separate from tasks.**
They may reference work objects, but should not be reduced to a task property.

## Decision 3
**Project Step is a read-model entity.**
It may originate from cached tasks, but should remain a distinct UX/domain concept.

## Decision 4
**Approval is cross-cutting.**
Do not model it as ad-hoc per module only.

## Decision 5
**Workspace is a client-visible module boundary, not a project substitute.**

---

## 5. Unresolved Questions

These remain open and must be clarified before implementation in staging:

1. Should tickets optionally link to projects from day one?
2. Should client memory entries be manually curated only at first, or partly auto-suggested later?
3. What exactly is the commercial unit of a credit?
4. Who approves credit-impacting work?
5. Which approval surfaces are internal-only vs client-facing?
6. How much project context should be visible to clients vs only to internal operators?

---

## 6. What This Document Enables

With this domain model in place, the next documents can become much sharper:

- Product Gap List
- Delivery Rules
- staging implementation plan
- future credits design
- future client memory design

---

## 7. Immediate Conclusion

The portal should now be treated as one system composed of:

- Client
- Workspaces
- Projects
- Tickets
- Project Steps
- Comments/Messages
- Client Memory
- Credits
- Approval surfaces

Future work should fit into this model instead of creating new parallel structures.
