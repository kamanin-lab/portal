---
phase: 5
slug: data-unification-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run src/modules/projects/__tests__/` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run src/modules/projects/__tests__/`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-00-01 | 00 | 0 | DATA-02 | unit stub | `npm run test -- --run src/modules/projects/__tests__/FilesTab.test.tsx` | ❌ W0 | ⬜ pending |
| 05-00-02 | 00 | 0 | DATA-02 | unit stub | `npm run test -- --run src/modules/projects/__tests__/StepFilesTab.test.tsx` | ❌ W0 | ⬜ pending |
| 05-00-03 | 00 | 0 | DATA-03 | unit stub | `npm run test -- --run src/modules/projects/__tests__/OverviewTabs.test.tsx` | ❌ W0 | ⬜ pending |
| 05-00-04 | 00 | 0 | DATA-04 | unit extend | `npm run test -- --run src/modules/projects/__tests__/PhaseTimeline.test.tsx` | ✅ extend | ⬜ pending |
| 05-01-xx | 01 | 1 | DATA-02 | unit | `npm run test -- --run src/modules/projects/__tests__/FilesTab.test.tsx` | ❌ W0 | ⬜ pending |
| 05-01-xx | 01 | 1 | DATA-02 | unit | `npm run test -- --run src/modules/projects/__tests__/StepFilesTab.test.tsx` | ❌ W0 | ⬜ pending |
| 05-02-xx | 02 | 1 | DATA-03 | unit | `npm run test -- --run src/modules/projects/__tests__/OverviewTabs.test.tsx` | ❌ W0 | ⬜ pending |
| 05-03-xx | 03 | 1 | DATA-04 | unit | `npm run test -- --run src/modules/projects/__tests__/PhaseTimeline.test.tsx` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/modules/projects/__tests__/FilesTab.test.tsx` — stubs for DATA-02 FilesTab behavior (mock useNextcloudFiles, downloadFile)
- [ ] `src/modules/projects/__tests__/StepFilesTab.test.tsx` — stubs for DATA-02 StepFilesTab path construction and empty state
- [ ] `src/modules/projects/__tests__/OverviewTabs.test.tsx` — stubs for DATA-03 tab rendering with AnimatePresence mock
- [ ] Extend `PhaseTimeline.test.tsx` with DATA-04 skeleton test case

*Existing `PhaseTimeline.test.tsx` already has all mocks set up (motion/react, radix-ui, useBreakpoint) — extend it, don't rewrite.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tab fade+slide animation looks smooth | DATA-03 | Visual animation quality | Navigate between tabs, verify opacity 0→1 and y 8→0 transition |
| PhaseTimeline skeleton matches stepper shape | DATA-04 | Visual layout match | Load OverviewPage with slow network, verify skeleton shape |
| Nextcloud folder auto-created on task creation | DATA-02 (webhook) | Requires ClickUp webhook trigger + Nextcloud server | Create task in ClickUp test folder, verify folder appears in Nextcloud |
| StepFilesTab shows correct files for task | DATA-02 | Requires real Nextcloud data | Open task detail, verify files match Nextcloud folder contents |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
