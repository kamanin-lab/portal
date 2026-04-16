---
phase: 9
slug: org-db-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend), psql (DB verification) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~10 seconds (no new frontend tests in Phase 9) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test` (ensures no regressions in existing tests)
- **After migration applied:** Run psql verification queries (see Manual-Only below)
- **After every plan wave:** Run `npm run test:coverage`
- **Before `/gsd-verify-work`:** Full suite must be green + all psql verifications pass
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | ORG-DB-01/02 | — | organizations + org_members tables created | manual-psql | `\dt public.organizations; \dt public.org_members;` | ✅ | ⬜ pending |
| 09-01-02 | 01 | 1 | ORG-DB-03/04 | — | user_org_ids() returns correct UUIDs | manual-psql | `SELECT public.user_org_ids();` as test user | ✅ | ⬜ pending |
| 09-01-03 | 01 | 1 | ORG-DB-05 | — | organization_id columns exist on 4 tables | manual-psql | `\d credit_packages; \d client_workspaces;` | ✅ | ⬜ pending |
| 09-01-04 | 01 | 1 | ORG-DB-06 | — | Data migration: 1 org per profile | manual-psql | `SELECT COUNT(*) FROM org_members; SELECT COUNT(*) FROM profiles;` | ✅ | ⬜ pending |
| 09-01-05 | 01 | 1 | ORG-DB-07 | — | NOT NULL constraints enforced | manual-psql | `\d credit_packages` — organization_id shows NOT NULL | ✅ | ⬜ pending |
| 09-01-06 | 01 | 1 | ORG-DB-08 | — | Dual RLS: data accessible via org policy | manual-psql | Query as org member, verify row returned | ✅ | ⬜ pending |
| 09-01-07 | 01 | 1 | ORG-DB-09 | — | Migration gate passed | migration-DO | Gate check in migration raises/passes correctly | ✅ | ⬜ pending |
| 09-01-08 | 01 | 1 | ORG-DB-10 | — | notifications_type_check extended | manual-psql | `\d notifications` — check constraint updated | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 9 is SQL-only — no new frontend or Edge Function code. Wave 0 applies only to regression protection:

- [ ] Run `npm run test` before migration — establish green baseline
- [ ] Run `npm run test` after migration — confirm no regressions

*No new test stubs needed. All verification is manual psql inspection.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| organizations + org_members tables exist | ORG-DB-01/02 | Pure DB schema, no frontend | `\dt public.org*` in psql |
| user_org_ids() returns correct results | ORG-DB-03 | Requires authenticated psql session | `SET LOCAL request.jwt.claims = '{"sub":"<user_id>"}'; SELECT * FROM public.user_org_ids();` |
| user_org_role() returns correct role | ORG-DB-04 | Requires authenticated psql session | `SELECT public.user_org_role('<org_id>');` |
| Data migration integrity | ORG-DB-06 | Row-level inspection | `SELECT p.email, o.slug, om.role FROM profiles p JOIN org_members om ON om.profile_id = p.id JOIN organizations o ON o.id = om.organization_id;` |
| Dual RLS: existing profile_id policy still works | ORG-DB-08 | Runtime policy evaluation | Confirm portal loads task list without code changes after migration |
| Dual RLS: new org_id policy grants access | ORG-DB-08 | Runtime policy evaluation | Query credit_packages via anon key with org member's JWT |
| Migration gate validation | ORG-DB-09 | Transactional — passes or rolls back | Apply migration and verify it completes without error |
| notifications constraint updated | ORG-DB-10 | CHECK constraint inspection | `SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conname = 'notifications_type_check';` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
