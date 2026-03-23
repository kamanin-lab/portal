# Team Dashboard

_Status: idle_ · _Last updated: 2026-03-23_

## Current Task
None — Yuri sleeping, QA fixes committed

## Active Agents
None

---

## Completed Tasks

### QA-001: Full Playwright Test + Fixes (2026-03-23)
Full portal click-through. Found 2 blocking bugs, fixed immediately.
- On Hold tasks: added Resume button (was showing Pause on already-paused tasks)
- NotificationBell: fixed 404 navigation (`/tickets/id` → `/tickets?taskId=id`)
- StatusBadge umlaut: "Rueckmeldung" → "Rückmeldung"

### TASK-010: Credit System Phase 1 (2026-03-23)
Credits on tasks, balance in sidebar, webhook sync, monthly cron.
- `13e69b2` · 14 files, 2 review cycles

### TASK-009: File Management (2026-03-23)
Upload + create folder in DateienPage.
- `2b4fbd7` · 6 files

### TASK-008: shadcn/ui Migration (2026-03-23)
8 components, token unification, component extraction.
- `1657993`, `7a6aaaa`

### TASK-007–001: See git log for details.

## Launch Readiness — MBM
- [x] Tasks (tickets) — working
- [x] Credits — working (pending ClickUp field ID in Coolify)
- [x] Support chat — working
- [x] Login/auth — working
- [x] Real-time updates — working
- [x] Mobile — working
- [x] On Hold / Resume — fixed
- [x] Notification links — fixed
- [ ] DNS change to portal domain (Yuri action)
- [ ] CLICKUP_CREDITS_FIELD_ID in Coolify (Yuri action)

## Residual Items
- raw_data shape inconsistency between fetch paths
- Empfehlungen page (future)
- MBM file migration to Nextcloud
- Credit System Phase 2 — AI estimation
- Credit System Phase 3 — budgets, limits, reports

Legend: ⬜ pending | 🔄 in progress | ✅ done | ❌ blocked | ⏭️ skipped
