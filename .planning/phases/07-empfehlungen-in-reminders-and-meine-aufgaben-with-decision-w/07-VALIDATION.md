---
phase: 7
slug: empfehlungen-in-reminders-and-meine-aufgaben-with-decision-w
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-14
updated: 2026-04-14
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test:coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Requirement ID Namespace

Phase 7 uses the requirement IDs declared in ROADMAP.md Phase 7 Requirements line:
- **REMIND-01, REMIND-02, REMIND-03** — recommendation reminder backend (DB column, cron job, cooldown)
- **UI-01, UI-02, UI-03** — MeineAufgabenPage recommendations block, empty state, click-to-open
- **EMAIL-01** — recommendation_reminder email copy (German + English)

All per-task rows below reference these IDs.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | REMIND-01 | T-07-01..03 | DB migration adds last_recommendation_reminder_sent_at to profiles | manual | `grep -q "last_recommendation_reminder_sent_at" supabase/migrations/20260414100000_recommendation_reminder_column.sql` | ✅ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | UI-01, UI-02, UI-03 | T-07-10 | MeineAufgabenPage test stubs (RED) for recommendations block, empty state, click-to-open | unit | `npm run test -- src/shared/pages/__tests__/MeineAufgabenPage.test.tsx --run` | ❌ W0 RED | ⬜ pending |
| 7-01-03 | 01 | 1 | EMAIL-01 | — | recommendation_reminder email copy test stub (RED) | unit | `npm run test -- emailCopy-recommendation --run` | ❌ W0 RED | ⬜ pending |
| 7-01-04 | 01 | 1 | UI-02 (Später) | T-07-11, T-07-13 | RecommendationsBlock Später session-snooze test stub (RED) | unit | `npm run test -- src/modules/tickets/__tests__/RecommendationsBlock.test.tsx --run` | ❌ W0 RED | ⬜ pending |
| 7-02-01 | 02 | 2 | EMAIL-01 | — | recommendation_reminder emailCopy entry turns GREEN | unit | `npm run test -- emailCopy-recommendation --run` | ✅ green after 02 | ⬜ pending |
| 7-02-02 | 02 | 2 | REMIND-01, REMIND-02, REMIND-03 | T-07-04..09 | sendRecommendationReminders job wired into send-reminders with atomic claim | manual+grep | `grep -q "sendRecommendationReminders" supabase/functions/send-reminders/index.ts && grep -q "CRON_SECRET" supabase/functions/send-reminders/index.ts` | ✅ after 02 | ⬜ pending |
| 7-03-01 | 03 | 2 | UI-01, UI-02, UI-03 | T-07-10..13 | MeineAufgabenPage recommendations block + Später turn GREEN | unit | `npm run test -- MeineAufgabenPage --run && npm run test -- RecommendationsBlock --run` | ✅ after 03 | ⬜ pending |
| 7-03-02 | 03 | 2 | UI-01, UI-02, UI-03 | — | Human checkpoint: full flow (open sheet, Ja/Nein, Später session-only) | manual | `echo "Manual checkpoint — awaiting human approval"` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Plan 01 creates the following failing test files (RED stubs) before any implementation work begins:

- [ ] `src/shared/pages/__tests__/MeineAufgabenPage.test.tsx` — failing stubs for UI-01 (renders RecommendationsBlock), UI-02 (empty state conditional on recommendations), UI-03 (click opens TaskDetailSheet via setSearchParams)
- [ ] `src/modules/tickets/__tests__/emailCopy-recommendation.test.ts` — failing stub for EMAIL-01 (recommendation_reminder German subject/title/cta)
- [ ] `src/modules/tickets/__tests__/RecommendationsBlock.test.tsx` — failing stub for UI-02 Später session-snooze (clicking Später hides the card without a network call; remount brings it back)

Plan 02 Task 1 turns `emailCopy-recommendation.test.ts` GREEN.
Plan 03 Task 1 turns `MeineAufgabenPage.test.tsx` and `RecommendationsBlock.test.tsx` GREEN.

*Existing vitest infrastructure covers all phase requirements — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reminder email delivered to real inbox with correct German content | REMIND-01, EMAIL-01 | Email delivery requires live Mailjet + real profile | Trigger send-reminders manually for test account, check inbox |
| 5-day cooldown between recommendation reminders | REMIND-02 | Requires time manipulation or DB state inspection | Set last_recommendation_reminder_sent_at to 6 days ago, trigger cron, verify email sent |
| Full recommendations flow on MeineAufgabenPage | UI-01, UI-02, UI-03 | Visual verification of sheet open, Ja/Nein, Später | Plan 03 Task 2 checkpoint — 11-step walkthrough |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (MeineAufgabenPage, emailCopy, RecommendationsBlock)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
