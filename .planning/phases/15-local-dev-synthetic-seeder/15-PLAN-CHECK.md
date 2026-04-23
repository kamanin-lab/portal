# Phase 15 Plan Check — Local Dev + Synthetic Seeder

**Checker:** gsd-plan-checker (goal-backward)
**Date:** 2026-04-23
**Plans reviewed:** 15-01-PLAN.md (Stream A), 15-02-PLAN.md (Stream B)
**Phase goal:** DDEV Summerfield clone reachable, both plugins active, MCP Adapter installed, credentials issued, ~1100 paid seeded orders with validated distributions, reset idempotent.

---

## Verdict

**APPROVE** — with three optional tightening notes (non-blocking).

Both plans hang together cleanly. Requirement coverage is 100% (19/19 REQ-IDs map to concrete tasks). The critical ordering gotcha (.gitignore whitelist before seeder file creation) is correctly sequenced. Scope is disciplined — the plugin scaffold is explicitly empty, abilities are explicitly deferred to Phase 16. Acceptance tests are concrete and runnable. Plan 2 dependency on Plan 1 is declared in frontmatter. Phase 16 will find everything it needs (composer autoload wired, mu-plugins loader pattern, HPOS verified, App Password issued).

No blockers. No required revisions. The plans are ready for /gsd-execute-phase 15.

---

## Findings (1-15)

### 1. Requirement coverage (DEV-01..10, SEED-01..09 = 19 total)

**PASS.** All 19 REQ-IDs are covered across the two plans requirements frontmatter fields. Mapping verified:

| REQ-ID | Covering task(s) | Status |
|--------|------------------|--------|
| DEV-01 | Plan 1 frontmatter acknowledges pre-completed state (REQUIREMENTS.md DEV-01 marks it [x] DONE 2026-04-23) | acknowledged, no fake task |
| DEV-02 | Plan 1 Task 3 (MCP Adapter install + hook probe) | PASS |
| DEV-03 | Plan 1 Task 4 (kmn-revenue-abilities symlink + activate) | PASS |
| DEV-04 | Plan 1 Task 4 (maxi-ai symlink + activate) | PASS |
| DEV-05 | Plan 1 Task 5 (Application Password) | PASS |
| DEV-06 | Plan 1 Task 5 (WC REST keys) | PASS |
| DEV-07 | Plan 1 Task 4 Step 4 (HPOS verify) | PASS |
| DEV-08 | Plan 1 Task 5 Step 3 (Node + NODE_EXTRA_CA_CERTS probe) | PASS |
| DEV-09 | Plan 1 Task 1 (.gitignore whitelist fix) | PASS |
| DEV-10 | Plan 1 Task 6 (DECISIONS.md ADRs) | PASS |
| SEED-01 | Plan 2 Task 1 (WP-CLI command + 7 flags) | PASS |
| SEED-02 | Plan 2 Task 1 + Task 2 (distributions + validation) | PASS |
| SEED-03 | Plan 2 Task 1 generate_customers + sec 4d | PASS |
| SEED-04 | Plan 2 Task 1 compose_basket + BASKET_PAIRS | PASS |
| SEED-05 | Plan 2 Task 1 create_order with _kmn_test_order meta | PASS |
| SEED-06 | Plan 2 Task 1 reset method | PASS |
| SEED-07 | Plan 2 Task 1 guard_environment — first call in seed AND reset | PASS |
| SEED-08 | Plan 2 Task 2 validation queries 4a-4e with hard-fail ranges | PASS |
| SEED-09 | Plan 2 Task 2 time wrapper with 5min gate | PASS |

No requirement has zero tasks. No task covers a non-existent requirement. No duplicate coverage that would cause ambiguity.

### 2. DEV-01 pre-completed without fake tasks

**PASS.** Plan 1 does not manufacture a fake DEV-01 task. The frontmatter lists DEV-01 in requirements (correct — the phase owns the REQ-ID), but no task action duplicates work already done. Task 4 Step 4 and Task 5 Step 3 verify (not re-create) the deployed environment. The objective block at 15-01 lines 82-89 correctly frames the plan as bringing an already-deployed DDEV Summerfield environment to Phase 16 ready state.

### 3. Runnable acceptance tests

**PASS.** Every task has a runnable automated verify block with explicit expected output. Examples:

- 15-01 Task 1 line 188: git check-ignore with negated grep — exits non-zero when files trackable.
- 15-01 Task 4 line 472: ddev wp plugin list piped through wc -l and grep for exactly 2 active.
- 15-02 Task 2 line 611: awk with numeric bounds check $1>=1050 AND $1<=1150.

Checkpoint tasks (15-01 Task 7, 15-02 Task 4) also list 6-7 concrete verification commands each with expected output.

### 4. .gitignore fix BEFORE seeder file creation

**PASS.** Ordering is correct and explicit:
- 15-01 Task 1 fixes .gitignore (Wave 1, no deps).
- 15-02 Task 1 creates scripts/seed-orders.php (Wave 2, depends_on 15-01).
- 15-01 Task 2 Done gate at line 337 explicitly says git status shows 4 new untracked files confirming the .gitignore whitelist fix from Task 1 took effect — a closed-loop verification.

The current .gitignore line 47 scripts/* whitelist does silently ignore scripts/seed-orders.php (verified by reading .gitignore directly). Plan 1 Task 1 Change A (line 154-162) adds !scripts/*.php and !scripts/seed-orders.md before Plan 2 writes those files. Commit-lost scenario is prevented.

### 5. Plugin scaffold is EMPTY (no abilities)

**PASS — explicit scope guard is loud and correct.** Multiple guardrails:
- 15-01 Task 2 line 205: Phase 15 scope limit: the plugin must activate cleanly but register ZERO abilities. Abilities live in Phase 16. This is explicit scope to avoid creep.
- Plugin main file code block at lines 252-254 contains only a comment marker where Phase 16 will add ability loading, not the ability loader itself.
- Task 2 Do NOT create yet block at lines 319-325 names every Phase 16 file to forbid: abilities/*.php, bootstrap/register-mcp-server.php, includes/sql-helpers.php, includes/cache.php.
- Objective at line 85: The plugin scaffold is deliberately empty — abilities come in Phase 16.

Phase 16 will have concrete work to do (creating abilities against an activated shell).

### 6. Environment guard = FIRST check in seeder execute path

**PASS.** 15-02 Task 1 line 241 shows $this->guard_environment() as the first call inside seed(). Line 350 shows the same call as the first line of reset(). Lines 336-345 show the guard implementation refuses to run and calls WP_CLI::error() (hard-exit) if siteurl does not match the ddev.site regex. Threat T-15-07 at line 804 re-states this as the primary mitigation for accidental prod execution.

### 7. _kmn_test_order flag set on EVERY seeded order

**PASS.** 15-02 Task 1 line 407 inside create_order(): $order->update_meta_data(META_TEST_ORDER, 1) followed by $order->save(). create_order() is the single code path invoked from the order loop (line 313), so every seeded order gets the flag. Reset queries exclusively by this meta (line 352-357). Idempotency test in Task 2 Step 6 (lines 600-607) runs reset, re-seed, count and requires statistical equivalence.

Reset also cleans up wp_wc_customer_lookup for guest emails at lines 372-376 — good bonus defense against orphans.

### 8. Maxi AI symlink source path

**PASS.** 15-01 Task 4 line 432: ln -sfn /mnt/g/01_OPUS/Projects/PORTAL/maxi-ai maxi-ai (executed from /home/upan/projects/sf_staging/wp-content/plugins/). This creates the symlink pointing at /mnt/g/01_OPUS/Projects/PORTAL/maxi-ai/. Exact match to the expected mapping in the review question.

key_link in frontmatter lines 72-75 also records the expected symlink target.

### 9. Plan 2 depends on Plan 1 — explicit + reason stated

**PASS.** 15-02 frontmatter lines 6-7: depends_on 15-01. The reason is implicit but discoverable in two places:
- 15-02 Task 1 verify block requires php -l and file creation to succeed — but file creation requires the .gitignore whitelist fix from Plan 1 Task 1 to have landed.
- 15-02 Task 2 pre-flight checks (lines 491-496) verify kmn-revenue-abilities plugin is active — a Plan 1 Task 4 deliverable.

Optional improvement: the reason for dependency could be called out in a one-line dependency_reason comment for future readers. Not required for execution.

### 10. Phase 16 prerequisites

**PASS.** Phase 16 (ABIL-SCAF-*, ABIL-DEF-*, ABIL-QA-*) will find:
- Plugin scaffold activated — kmn-revenue-abilities shows active in ddev wp plugin list (Plan 1 Task 4 done-gate).
- composer vendor/ ready — Plan 1 Task 3 runs composer install inside DDEV against the plugins own composer.json which declares wordpress/mcp-adapter 0.5.0 (Plan 1 Task 2 File 2, line 288). The require_once __DIR__ . /vendor/autoload.php line is already in the main plugin file at line 228.
- Application Password available — Plan 1 Task 5 issues it, records out-of-band into mcp-poc/.env.local as WOOCOMMERCE_WP_APP_PASS (line 493).
- HPOS verified — Plan 1 Task 4 Step 4 confirms wp_wc_order_stats and wp_wc_order_product_lookup exist (line 454-456).
- MCP Adapter autoload proven — Plan 1 Task 3 verify block runs a class_exists/defined probe (line 400). Phase 16 mcp_adapter_init hook will fire into an already-autoloaded adapter.
- Seeded data — Plan 2 produces ~1100 paid orders with >=200 multi-item, enabling ABIL-DEF-04 market_basket_product mode on real data.

Phase 16 handoff is clean.

### 11. Highest-risk task per plan — called out

**PASS with nuance.**

Plan 1 highest risk: **Task 3 (MCP Adapter install)** — Option A/B/manual fallback chain acknowledges upstream package availability is not guaranteed. Called out: line 366 If both fail, create a CHECKPOINT. Threat T-15-02 at line 678 calls out vendor/ supply-chain risk with 0.5.0 pinned (not ^0.5.0).

Plan 2 highest risk: **Task 2 runtime (SEED-09 <=5 min)** — explicitly flagged at lines 454-463 with profiling fallback guidance. Threat T-15-09 at line 806 treats as accept with executor-must-profile-before-Checkpoint-4 gate.

Risk language is present in both plans. One optional tightening (see below): neither plan includes an explicit top-level Known risks section — they are scattered across threat models and task action bodies. Acceptable as-is.

### 12. Runtime SEED-09 <=5min realistic

**PASS — with credible optimizations.** Plan 2 Task 1 performance-hygiene block (lines 454-462) lists six concrete measures:
1. woocommerce_email_new_order_enabled=no
2. define WP_IMPORTING true suppresses expensive hooks
3. Batch customer creation before order loop
4. $order->calculate_totals(false) where allowed
5. No wp_cache_flush() inside loop
6. Consider remove_action woocommerce_new_order for known-expensive listeners

At 1260 orders / 300 seconds = 4.2 orders/sec average, this is a comfortable budget for WooCommerce on DDEV given the hygiene above. The task explicitly notes that if the first run exceeds 5 min, the executor MUST profile and either fix or flag — not silently accept. Task 2 Step 4 uses time wrapper to measure wall-clock.

### 13. Rollback path if Plan 1 breaks DDEV

**PASS (adequate).** Recovery paths are implicit but reachable:
- Symlinks (Task 4): rm symlink AND ddev wp plugin deactivate restores baseline; idempotent ln -sfn also safe to re-run.
- MCP Adapter (Task 3): rm -rf wp-content/mu-plugins/vendor/wordpress/mcp-adapter AND rm wp-content/mu-plugins/load-mcp-adapter.php removes install.
- .gitignore (Task 1): git checkout .gitignore restores.
- DECISIONS.md / CHANGELOG.md (Task 6): git checkout those files.
- HPOS migration (Task 4 Step 4): WC admin has a compatibility mode toggle; WP also has a rollback SQL script.

The DDEV site itself is a clone of production data — worst case, ddev stop AND ddev import-db restores from the last snapshot. Plan 1 does not mention this explicitly, which is the one gap. It is mitigated by the phase nature (DDEV is ephemeral dev env owned by Yuri, prod never touched). Not a blocker.

Optional improvement: add a one-line Rollback note to 15-01 threat_model referencing ddev stop AND ddev import-db snapshot as a nuclear reset.

### 14. Absolute paths

**PASS.** Both plans use absolute paths consistently:
- Windows paths for PORTAL git operations: G:/01_OPUS/Projects/PORTAL/... (files_modified fields, file artifacts, Windows-side git check-ignore commands).
- WSL paths for DDEV operations: /home/upan/projects/sf_staging/, /mnt/g/01_OPUS/Projects/PORTAL/..., /var/www/html/ for container paths.
- The two naming systems are kept in consistent context — commands that run from WSL use WSL paths; edits/git commands use the Windows path alias.

No relative paths in action blocks. No ambiguous cd followed by relative path writes to unrelated locations.

### 15. Task-level acceptance gates measurable

**PASS.** Every done block in both plans uses measurable conditions — file existence, command exit codes, exact numeric ranges, grep -q string presence. Samples:
- 15-01 Task 2 line 336: composer.json contains wordpress/mcp-adapter 0.5.0 (verifiable via grep).
- 15-01 Task 4 line 475: Both plugins appear with status=active in ddev wp plugin list + wp_wc_order_stats table exists (SQL verifiable).
- 15-02 Task 2 line 614: paid orders 1050-1150; Thursday highest DOW; multi-item 200-350; repeat rate 19-25%; top-3 hours include at least 2 of {10,11,19,20,21} — all numeric, all query-verifiable.

No vague verify that X works phrasing anywhere in the done blocks.

---

## Coverage Matrix

| Dimension | Status | Notes |
|-----------|--------|-------|
| Requirement Coverage (DEV + SEED) | PASS | 19/19 REQ-IDs mapped |
| Task Completeness (files/action/verify/done) | PASS | All 10 non-checkpoint tasks complete |
| Dependency Correctness | PASS | Plan 2 depends on Plan 1; no cycles |
| Key Links Planned | PASS | Symlinks + composer autoload + _kmn_test_order meta + siteurl guard all wired in action bodies, not just frontmatter |
| Scope Sanity | PASS | Plan 1 = 6 tasks + 1 checkpoint (warning territory but justified for first-time-in-repo infra work); Plan 2 = 3 tasks + 1 checkpoint |
| Must-haves Derivation | PASS | User-observable truths: Plugin list shows active, seeder refuses on non-DDEV, <=5 min runtime, 1100 paid orders |
| Context Compliance | N/A | No CONTEXT.md provided for this phase |
| Architectural Tier | PASS | Tiers correctly assigned — host FS (symlinks), container (WP + composer), CLI (seeder), portal repo (.gitignore + docs) |
| CLAUDE.md Compliance | PASS | First PHP convention explicitly calls out Maxi-AI mirror rule (no PSR-4, no modern 8.4 features); no test-framework conflict because WP-CLI is WP-native |
| Research Resolution | N/A | No RESEARCH.md for this phase (patterns document used instead) |
| Pattern Compliance | PASS | 15-PATTERNS.md thoroughly referenced: plugin main file mirrors maxi-ai/maxi-ai.php, .htaccess mirrors Maxi AI .htaccess, WP-CLI command follows public WP-CLI contract with no internal analog (acknowledged first-time-in-repo) |
| Scope Reduction | PASS | No v1/v2 / placeholder / simplified language in either plan; plugin scaffold is empty shell deliberately per Phase 16 split, not as scope reduction |

---

## Optional Improvements (non-blocking, nice-to-haves)

1. **Plan 1 rollback documentation** — add one line in 15-01 threat_model (near T-15-05) stating that DDEV site rollback path is ddev stop AND ddev import-db last-snapshot. Zero-effort, reduces cognitive load during execution if something breaks.

2. **Plan 2 runtime checkpoint** — Task 2 Step 4 could optionally include a 2-minute mid-run sanity — e.g., after the progress bar shows 50% ticks, check time elapsed is <2:30. This gives the executor a chance to abort early and profile instead of discovering at minute 6 that the budget is blown. Not required because Task 1 already lists six optimizations.

3. **Dependency reason annotation** — 15-02 frontmatter depends_on 15-01 is correct; consider adding a human-readable comment dependency_reason: 15-01 fixes .gitignore and creates the plugin shell that scripts/seed-orders.php implicitly relies on for mu-plugins loader pattern. Aids future readers doing phase-plan audits.

These are cosmetic. Do not hold execution for them.

---

## Recommendation

Plans are **APPROVED** for execution. Run /gsd-execute-phase 15 against Plan 1 first (Wave 1), then Plan 2 (Wave 2) after Plan 1 Checkpoint 7 human approval.

All downstream phases (16, 17, 19, 20) will have the prerequisites they declare dependencies on.
