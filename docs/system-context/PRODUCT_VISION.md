# Product Vision

## 1. Product Positioning

KAMANIN Client Portal is a controlled collaboration layer between an agency delivery team and its clients. The team works internally in ClickUp; clients interact with a purpose-built portal that surfaces only what is relevant to them. The portal is not a generic project management tool — it is a curated window into task progress, designed to drive client accountability (approvals, feedback) while shielding them from internal workflow complexity.

## 2. Problem It Solves

### Clients should not access ClickUp

ClickUp is optimized for internal team workflows: sprints, subtasks, internal reviews, time tracking. Exposing clients to this environment creates confusion, information overload, and support burden. The portal provides a clean, focused interface where clients see only tasks marked as visible, in language they understand.

### Controlled visibility

Not all tasks are client-relevant. The portal filters by a ClickUp custom field ("Visible in client portal"), ensuring clients only see deliverables that require their attention or awareness. Internal statuses like "Internal Review" and "Rework" are mapped to generic "In Progress" to avoid exposing process details.

### Clean UX

Clients have a single, clear action surface. When a task needs their input, it appears under "Needs Your Attention" with explicit Approve/Request Changes buttons. There is no ambiguity about what the client needs to do. The status system is reduced to 7 meaningful states (from ClickUp's 9+).

### Unified communication per task

All task-related communication happens in context. Comments are threaded per task. Team members use the `@client:` prefix in ClickUp to route messages to the portal. Portal responses are posted back to ClickUp as attributed comments. This eliminates scattered email threads and keeps the conversation anchored to the deliverable.

## 3. Target Audience

### Agency clients

Primary users are clients of the KAMANIN agency who have active projects. They need to review deliverables, provide feedback, approve work, and stay informed about progress without managing project details.

### Long-term retainers

Clients on ongoing retainer agreements benefit most from the portal. They have recurring tasks, ongoing communication, and a need for a persistent view of project status over time.

### Multi-project clients

Clients working across multiple ClickUp lists see a unified dashboard. Their `clickup_list_ids` profile field maps them to one or more ClickUp lists, and all visible tasks across those lists appear in a single interface.

## 4. Long-Term Vision

### Approvals

Expand the approval workflow beyond simple approve/reject. Planned capabilities include multi-stage approvals (e.g., design approval followed by copy approval), approval delegation, and approval audit trails.

### Milestones

Introduce milestone-level views that group related tasks into project phases. Clients would see progress at a higher level than individual tasks, with completion percentages and timeline indicators.

### SLA logic

Implement service level agreement tracking. Tasks would have defined response times and completion targets. The portal would surface SLA status (on track, at risk, breached) and trigger escalation notifications.

### White-label capability

Enable deployment of the portal under custom domains with per-client branding (logo, colors, email templates). This allows the agency to offer the portal as a branded service to each client organization.

### Multi-tenant architecture

Evolve from single-agency deployment to a multi-tenant platform where multiple agencies can each manage their own client base, ClickUp integrations, and portal configurations.

### Role-based expansion

Introduce role differentiation beyond the current flat client model. Potential roles: client admin (can manage team members), client viewer (read-only), agency manager (cross-client visibility), account manager (per-client oversight).

## 5. Competitive Framing

### vs. Direct ClickUp access

Giving clients ClickUp access exposes internal process, creates training overhead, and risks accidental modifications. The portal provides a controlled subset of ClickUp functionality with a purpose-built interface. Clients cannot modify task structure, reassign work, or access internal comments.

### vs. Email-based collaboration

Email scatters context across inboxes, lacks structure, and creates version conflicts. The portal centralizes communication per task, maintains a persistent timeline, and ensures both sides see the same state. Email is used only as a notification channel, not as the collaboration medium.

### vs. Generic ticket systems (Zendesk, Freshdesk, Jira Service Management)

Generic ticket systems require clients to learn a new tool, impose rigid workflows, and duplicate data across systems. The KAMANIN portal is purpose-built to project from ClickUp, eliminating data duplication. The team never leaves ClickUp; clients never enter it. There is no sync lag between an "internal" and "external" system because the portal reads directly from the same data source.
