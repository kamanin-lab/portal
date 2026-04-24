# Phase 16 Plan Check

**Checked:** 2026-04-23
**Plans reviewed:** 16-01-PLAN.md, 16-02-PLAN.md, 16-03-PLAN.md
**Research:** 16-RESEARCH.md
**Requirements source:** .planning/REQUIREMENTS.md (20 Phase 16 REQ-IDs)

---

## Verdict: APPROVE (with 2 minor non-blocking fixes)

All 20 Phase 16 REQ-IDs are mapped. Every RESEARCH correction (Findings 1-8) is honored. SQL patterns match HPOS contracts. Value-correct acceptance criteria land on the right numeric expectations. Phase 17 handoff is documented. The plans are internally consistent and executable.

Two minor issues worth fixing before execution, neither blocking:

1. **Median-days SQL alias scope bug** in 16-02 pseudocode: implementer will notice at lint time, but fix the plan now to prevent a wasted debug cycle.
2. **ABIL-QA-03 label confusion** in 16-03: plans conflate the REQUIREMENTS.md ABIL-QA-03 (query-timeout, which IS delivered) with the WP_BRIDGE-invented rate limit 60/min (which is deferred). Clarify naming so the SUMMARY does not claim a satisfied REQ-ID is deferred.

These are NOT BLOCK issues because (a) the actual delivered work is correct, (b) the implementer will catch the SQL alias at php -l or first wp eval run, and (c) the QA-03 confusion is cosmetic — ABIL-QA-03 query timeout IS implemented via kmn_revenue_set_query_timeout_ms(2000) in every ability.

---

## Findings (Q1 to Q20)

### Coverage

**Q1 — All 20 Phase 16 REQ-IDs mapped? ABIL-QA-03 deferral verified?**

**PASS.** Coverage verified:

| REQ-ID | Plan | Coverage |
|--------|------|----------|
| MCPAPP-WP-01 | 16-01 (readme + WP_BRIDGE doc ref) | OK |
| MCPAPP-WP-02 | 16-01 Task 2 (create_server + mcp_adapter_init) | OK |
| MCPAPP-WP-03 | 16-01 Task 2 (rotation runbook in readme.md); 16-03 notes DECISIONS.md update queued | OK |
| ABIL-SCAF-01 | 16-01 Task 1 (main plugin file) | OK |
| ABIL-SCAF-02 | 16-01 Task 1 (composer install + vendor/ commit) | OK |
| ABIL-SCAF-03 | 16-01 Task 2 (bootstrap/register-mcp-server.php) | OK |
| ABIL-SCAF-04 | 16-01 Task 1 (sql-helpers + cache + response + rate-limit) | OK |
| ABIL-SCAF-05 | 16-01 Task 2 (readme.md) | OK |
| ABIL-DEF-01 | 16-02 Task 2 (revenue-run-rate) | OK |
| ABIL-DEF-02 | 16-02 Task 1 (weekly-heatmap) | OK |
| ABIL-DEF-03 | 16-02 Task 1 (repeat-metrics) | OK |
| ABIL-DEF-04 | 16-02 Task 2 (market-basket) | OK |
| ABIL-DEF-05 | 16-03 Task 1 (weekly-briefing-data) | OK |
| ABIL-DEF-06 | 16-02 all abilities + 16-03 audit-sql.sh lint | OK |
| ABIL-DEF-07 | 16-01 cache.php + 16-02 every ability wraps in kmn_revenue_cached() | OK |
| ABIL-QA-01 | 16-03 Task 2 (verify-wp-bridge.sh) | OK |
| ABIL-QA-02 | 16-03 Task 2 (auth matrix; wording corrected per RESEARCH B7) | OK (with rewording) |
| ABIL-QA-03 | 16-02 every ability calls kmn_revenue_set_query_timeout_ms(2000); 16-03 audit-sql.sh enforces presence | OK — delivered, NOT deferred (see Q6) |
| ABIL-QA-04 | 16-02 all abilities HPOS-only; 16-03 audit-sql.sh lint | OK |
| ABIL-QA-05 | 16-03 Task 2 (verify-coexistence.sh) | OK |

**Zero orphaned REQ-IDs.** No requirement is silently dropped.

Regarding the prompt claim that ABIL-QA-03 should be explicitly deferred with stub: this is a prompt error or misreading of REQUIREMENTS.md. The REQUIREMENTS.md definition of ABIL-QA-03 (line 71) is the 2-second query timeout (not a rate limit), and that IS delivered via kmn_revenue_set_query_timeout_ms(). The rate limit 60/min mentioned in RESEARCH B6/E1 comes from WP_BRIDGE section 9 incorrect assumption and is correctly documented as deferred via includes/rate-limit.php stub — but it was never a REQUIREMENTS.md line item. Plans 16-01 and 16-03 implement the stub correctly (16-01 Task 1 step 6) but label it ABIL-QA-03 which muddles the taxonomy. See Q6 below.

---

### Research Fidelity (critical)

**Q2 — Finding 1: create_server() signature corrected (server_route_namespace / server_route / tools)?**

**PASS.** 16-01-PLAN.md:103-117 (context interfaces) explicitly calls out the corrected signature. The bootstrap file in Task 2 (L386-407) uses PHP 8 named args with all three corrected names: server_id, server_route_namespace ('mcp'), server_route ('kmn-revenue'), tools (array of 5 ability IDs). The AVOID block at L517-520 explicitly warns against the WP_BRIDGE wrong names (rest_namespace / rest_route / abilities).

**Q3 — Finding 2: wc_order_stats has NO billing_email — per-customer queries JOIN wc_orders?**

**PASS.** 16-02-PLAN.md:

- kmn/repeat-metrics compute closure L383-392 explicitly does JOIN {$wpdb->prefix}wc_orders o ON s.order_id = o.id and GROUP BY o.billing_email.
- Median query L338-356 same JOIN pattern.
- Weekly-briefing in 16-03 delegates to repeat-metrics directly — inherits the correct join.
- sql_corrections_from_research block L179-206 enumerates this as correction #1.
- key_links L52-54 pins the JOIN pattern as verification gate.
- Audit script in 16-03 (audit-sql.sh L566-570) fails the build if returning_customer appears anywhere.

**Q4 — Finding 3: payment_method on wc_orders top-level (not meta)?**

**PASS.** 16-02-PLAN.md Task 2 revenue-run-rate L582-591 selects o.payment_method via JOIN {$wpdb->prefix}wc_orders o ON s.order_id = o.id and groups by it. Denormalized column used directly; no wc_orders_meta lookup. sql_corrections_from_research correction #2 restates it. key_links L58-62 pins payment_method as pattern.

**Q5 — Finding 4: Tool names sanitized (kmn-weekly-heatmap not kmn/weekly-heatmap) in verify script?**

**PASS.** 16-03-PLAN.md:
- L439-441 of verify-wp-bridge.sh: expected names sorted "kmn-market-basket,kmn-repeat-metrics,kmn-revenue-run-rate,kmn-weekly-briefing-data,kmn-weekly-heatmap,".
- Every call kmn-... invocation uses hyphenated form.
- success_criteria L800 documents Phase 17 handoff: tool names sanitized to hyphens; mcp-proxy ALLOWED_TOOLS list must use HYPHENATED form.
- 16-01 readme includes the sanitization table (L447-459).

**Q6 — Finding 5: No built-in rate limiter — stub created in 16-01, documented in 16-03?**

**PASS (structurally) with LABEL WARNING.**

- 16-01 Task 1 Step 6 (L261-268) creates includes/rate-limit.php as a stub with body commented out, returning true unconditionally, explicit DEFERRED to v3.1 docblock.
- 16-01 seeded_data_facts and threat_model T-16-01-05 note deferral.
- 16-03 reqid_corrections L122-123 documents deferral.
- 16-03 must_haves L30 mentions ABIL-QA-03 (rate limit 60/min) DOCUMENTED as deferred to v3.1.

**Label warning (non-blocking):** 16-03 L30, L68, and the reqid_corrections block at L122-123 call this ABIL-QA-03 — but REQUIREMENTS.md ABIL-QA-03 is the 2-second query timeout (delivered via kmn_revenue_set_query_timeout_ms). The rate-limit-60/min came from WP_BRIDGE section 9 and is NOT a REQUIREMENTS.md item. The plans conflate the two, which is harmless for execution but will confuse the SUMMARY. See Required Fixes #2.

**Q7 — Finding 6: 401 for wrong app pass; 200 + isError:true for capability failure (not 403)?**

**PASS.** 16-03-PLAN.md:
- reqid_corrections block L113-121 explicitly corrects the ABIL-QA-02 wording.
- verify-wp-bridge.sh L509-513 asserts HTTP 401 for wrong password.
- L515-525 asserts HTTP 200 + isError:true for subscriber user (opt-in via env var).
- done L27-28 lists both criteria.
- 16-01 Task 2 verify L547-550 also asserts 401 on wrong app pass.

**Q8 — Finding 7: Numeric UTC offsets used (even though DDEV has tz tables)?**

**PASS.** 16-02-PLAN.md:
- sql-helpers.php kmn_revenue_get_utc_offset() (16-01 L234-240) returns numeric format +HH:MM.
- Heatmap SQL L258-267 binds $offset via %s placeholder; passed to CONVERT_TZ(s.date_created, +00:00, %s).
- Run-rate SQL L527-536 same pattern.
- sql_corrections_from_research correction #3 restates portability decision.
- AVOID block L419 in repeat-metrics notes CONVERT_TZ not needed there.

**Q9 — Finding 8: Composer pin exact 0.5.0 (not ^0.5.0)?**

**PASS.** 16-01-PLAN.md:
- seeded_data_facts L136: Composer pin wordpress/mcp-adapter: 0.5.0 (exact, pre-1.0) — do NOT loosen to ^0.5.0.
- Task 1 Step 1 L171-175 installs from existing scaffold composer.json; scaffold has exact pin confirmed.
- threat_model T-16-01-07 lists it as tampering mitigation.

Note: REQUIREMENTS.md ABIL-SCAF-02 text says ^0.5.0, but RESEARCH section E open question #4 flags that exact pin is already committed and recommends keeping it. Plans honor the stricter pin — correct call.

---

### SQL Correctness

**Q10 — Every SQL uses $wpdb->prefix (never hardcoded wp_ or s7uy9uh34_)?**

**PASS.** All SQL strings in 16-01 and 16-02 use {$wpdb->prefix} interpolation. 16-03 audit-sql.sh L578-582 explicitly fails the build if literal s7uy9uh34_ appears anywhere in abilities/ or includes/. 16-01 seeded_data_facts L131 and 16-02 seeded_data_facts L167 both restate the rule.

**Q11 — Market-basket self-join status filter in JOIN, not post-filter?**

**PASS (with perf note).** 16-02-PLAN.md L731-741 joins wc_order_product_lookup a and b with product-id inequality, then INNER JOINs wc_order_stats s, then filters on WHERE s.date_created and s.status IN (...). MySQL optimizer pushes the predicate into the INNER JOIN — RESEARCH E1 EXPLAIN confirms eq_ref/ref hits and ~1732 rows examined, pure MySQL time under 500ms. This is functionally equivalent to filtering in the JOIN clause for INNER JOIN. Not strictly in the JOIN syntactically, but perf is not a concern given the EXPLAIN baseline. Acceptable.

**Q12 — Heatmap uses numeric UTC offset computed in PHP, not named timezone?**

**PASS.** 16-02-PLAN.md L252 $offset = kmn_revenue_resolve_tz_offset($input); returns +HH:MM string from PHP. L258-268 binds it as %s to CONVERT_TZ(s.date_created, +00:00, %s). No named-tz string is ever passed to MySQL.

**Q13 — Repeat-metrics counts customer with 2+ orders in window (not returning_customer flag)?**

**PASS.** 16-02-PLAN.md compute closure L395-400 iterates groups by o.billing_email COUNT(*), and tallies $returning++ when cnt >= 2. Never references wc_order_stats.returning_customer. 16-03 audit-sql.sh L566-570 fails on any returning_customer reference. AVOID block L416-417 explicitly forbids it.

---

### Acceptance Criteria Realism

**Q14 — 16-02 specifies numeric expectations against seeded data?**

**PASS.** 16-02-PLAN.md must_haves.truths (L24-32) specifies:
- best_slot.day_of_week=4, hour_of_day=20, order_count ~19 plus or minus 2
- repeat_rate_pct between 18.0 and 22.0 (Phase 15 validation 20.1%)
- revenue-run-rate.confidence in {high, medium, low}
- market-basket.mode='market_basket_product' with basket_pairs length >= 3

Verify block L443-456 encodes these with tolerances including awk numeric comparisons. These numbers match the Phase 15 seeded-data validation exactly.

**Q15 — 16-03 verify script tests shape AND value correctness?**

**PASS.** 16-03-PLAN.md verify-wp-bridge.sh:
- L451-462 heatmap: asserts dow=4, hod=20, oc in [17,21], buckets_len>=30.
- L464-474 repeat-metrics: asserts rate in [18,22], benchmark_pct==27.0.
- L476-485 run-rate: asserts confidence enum, expected_by_hour length 24, payment_split is array.
- L487-497 market-basket: asserts mode=market_basket_product, basket_pairs>=3, aov_bands length 3.
- L499-506 briefing: asserts sub-sections present, top_products_3 length 3.

Not a single shape-only check — every assertion includes value context.

---

### Phase 17 Handoff

**Q16 — Tool names documented in hyphenated form for Phase 17?**

**PASS.** 16-01-PLAN.md readme table L449-459 lists both forms with explicit Callers (MCP clients, mcp-poc) use the hyphenated form in tools/call. 16-03 success_criteria L800 states explicitly: use the HYPHENATED tool names (kmn-weekly-heatmap, etc.) in tools/call, NOT the slashed ability IDs. Phase 17 mcp-proxy whitelist also uses the hyphenated form. Documented in plugin readme. 16-03 output L813 adds this to the SUMMARY required sections.

**Q17 — Bootstrap create_server() registers all 5 abilities eagerly, or incrementally?**

**PASS — eagerly, all 5 at once.** 16-01-PLAN.md Task 2 L396-405 lists all 5 ability IDs in tools array. L413 documents: For Plan 16-01 run-through none will resolve, adapter returns empty tools/list (verified in RESEARCH I2 Mitigation 1 — planned behavior, not bug). L519 AVOID: Do NOT remove the 5 ability IDs from tools even though they do not exist yet — pre-listing them makes Plan 16-02 a pure additive change.

This is the correct approach per RESEARCH I2 biggest-unknown mitigation — it catches adapter integration bugs before ability code lands.

---

### Risk and Rollback

**Q18 — Riskiest task in each plan called out?**

**PASS.**
- 16-01: threat_model L580-589 enumerates 7 STRIDE threats with dispositions; composer dep swap (T-16-01-07) + credential leak (T-16-01-04) are flagged as highest-concern items.
- 16-02: objective L75 explicitly sequences tasks per RESEARCH I1 risk ranking (weekly-heatmap to repeat-metrics to revenue-run-rate to market-basket). threat_model T-16-02-05 flags market-basket self-join DoS as highest perf risk with 2s execution cap mitigation.
- 16-03: threat_model T-16-03-01 flags sub-ability invocation skipping permission_callback as intentional-per-RESEARCH-Q3; T-16-03-04 flags cold-cache fan-out; checkpoint gate ensures human review.

**Q19 — Rollback plans clear?**

**PASS.**
- 16-01 Task 1 rollback L292: git checkout + ddev wp plugin deactivate kmn-revenue-abilities — plugin deactivation restores WP site to pre-phase-16 state. Since the plugin is NEW this phase (Phase 15 left an empty shell), production impact is zero.
- 16-01 Task 2 rollback L522: git rm bootstrap/register-mcp-server.php + git checkout readme.md; endpoint disappears immediately on deactivate.
- 16-02 both tasks rollback via git checkout abilities/<files> — removing ability files restores tools/list to previous task count.
- 16-03 rollback L647: git rm scripts/*.sh — test harness only; plugin still works.

If bootstrap plugin registration is broken mid-activation: ddev wp plugin deactivate kmn-revenue-abilities takes immediate effect, and because mcp_adapter_init no longer fires, the /wp-json/mcp/kmn-revenue route 404s. WP site itself is unaffected (plugin registration has no global side effects beyond the MCP route).

---

### Format and Practical

**Q20 — All file paths absolute? Dependencies between plans explicit?**

**PASS (with note).**

- files_modified uses repo-relative paths (e.g. wordpress-plugins/kmn-revenue-abilities/...) — consistent with other GSD plans in this project. Full absolute paths appear in execution_context via @$HOME/... references.
- Dependencies explicit in frontmatter:
  - 16-01: depends_on: [] (Wave 1)
  - 16-02: depends_on: [16-01] (Wave 2)
  - 16-03: depends_on: [16-02] (Wave 3)
- Wave numbers match the dep graph. No cycles, no forward references.

Relative paths in files_modified are standard GSD convention and acceptable.

---

## Required Fixes (non-blocking — APPROVE with these applied)

### Fix #1 — Median SQL alias scope bug in 16-02

**Location:** 16-02-PLAN.md lines 338-356, inside repeat-metrics execute_callback.

**Issue:** The median query uses a derived subquery aliased (...) t but the outer GROUP BY o.billing_email references alias o which is only in scope inside the inner subquery, not outside it. Similarly MIN(CASE WHEN rn = 1 THEN s.date_created END) references s which is out of scope at that depth. SQL will error at parse time on both names.

**Current (broken):**
```
SELECT DATEDIFF(second_date, first_date) AS days_diff FROM (
     SELECT o.billing_email,
            MIN(CASE WHEN rn = 1 THEN s.date_created END) AS first_date,
            MIN(CASE WHEN rn = 2 THEN s.date_created END) AS second_date
     FROM (
         SELECT s.order_id, s.date_created, o.billing_email,
                ROW_NUMBER() OVER (PARTITION BY o.billing_email ORDER BY s.date_created) AS rn
         FROM   {$wpdb->prefix}wc_order_stats s
         JOIN   {$wpdb->prefix}wc_orders o ON s.order_id = o.id
         WHERE  s.date_created >= %s AND s.date_created < %s
           AND  s.status IN ($placeholders)
     ) t
     GROUP BY o.billing_email     -- WRONG: o is out of scope; must be t.billing_email
     HAVING second_date IS NOT NULL
 ) pairs
```

**Fix:** In the middle SELECT, reference t for all column aliases since we are selecting FROM (derived subquery) t:

```
SELECT DATEDIFF(second_date, first_date) AS days_diff FROM (
     SELECT t.billing_email,
            MIN(CASE WHEN t.rn = 1 THEN t.date_created END) AS first_date,
            MIN(CASE WHEN t.rn = 2 THEN t.date_created END) AS second_date
     FROM (
         SELECT s.order_id, s.date_created, o.billing_email,
                ROW_NUMBER() OVER (PARTITION BY o.billing_email ORDER BY s.date_created) AS rn
         FROM   {$wpdb->prefix}wc_order_stats s
         JOIN   {$wpdb->prefix}wc_orders o ON s.order_id = o.id
         WHERE  s.date_created >= %s AND s.date_created < %s
           AND  s.status IN ($placeholders)
     ) t
     GROUP BY t.billing_email
     HAVING second_date IS NOT NULL
 ) pairs
```

RESEARCH D2 lines 422-441 have the same alias issue in the original pseudocode — the implementer may copy it. Fixing the plan now prevents a 15-minute debug cycle on first wp eval.

### Fix #2 — Clarify ABIL-QA-03 label in 16-03

**Location:** 16-03-PLAN.md lines 30, 68, 113-123, 687, 811.

**Issue:** The plan repeatedly labels the rate-limit deferral as ABIL-QA-03 but REQUIREMENTS.md (line 71) defines ABIL-QA-03 as the 2-second query timeout. The query timeout IS implemented in Plan 16-02 and enforced by 16-03 audit-sql.sh (lines 572-576). The rate-limit-60/min is a WP_BRIDGE section 9 fiction corrected by RESEARCH B6 — it was never a REQ-ID.

**Fix:** Rename references in 16-03:

- must_haves.truths L30: change to: Rate limit 60/min (from WP_BRIDGE section 9, NOT a REQUIREMENTS.md line item) DOCUMENTED as deferred to v3.1 per RESEARCH B6 — stub in includes/rate-limit.php from Plan 16-01.
- reqid_corrections block L122-123: rename subsection header from ABIL-QA-03 (rate limit 60/min) to Rate limit 60/min (WP_BRIDGE section 9 deferral — NOT a REQUIREMENTS.md REQ-ID).
- L687 what-built: change ABIL-QA-03 (rate limit) explicitly DEFERRED to Rate limit (WP_BRIDGE section 9, no REQ-ID) explicitly DEFERRED; ABIL-QA-03 (2s query timeout REQ-ID) IS delivered via kmn_revenue_set_query_timeout_ms().
- L811 output section: update the SUMMARY required bullet to distinguish.

Cosmetic but will prevent the SUMMARY from claiming a delivered REQ-ID is deferred. No code changes required.

---

## Optional Improvements (non-blocking suggestions)

1. **Add actionscheduler queue pre-clean step** to 16-03 Task 2 verify-wp-bridge.sh. RESEARCH E open question #9 flags that seeder leaves 20k+ pending wc-admin_import_orders actions which can inflate SQL times during integration runs. Add at top of verify-wp-bridge.sh a one-line DELETE of pending actions.

2. **Expose _skip_cache only in non-production.** 16-01 cache.php helper accepts $skip flag. Consider gating on defined(WP_DEBUG) so production does not respond to cache-bust requests from mcp-poc. Currently the helper accepts $skip unconditionally.

3. **Document cold-cache warmup** in 16-01 readme. RESEARCH E open question #6 notes that first call after a seed-reset has all 5 transients cold, so 4+ queries times 500ms equals ~2s cold. Add a one-liner to readme: After seeder runs, call kmn-weekly-briefing-data once to warm caches before first widget load.

4. **16-02 Task 1 repeat-metrics closure reference** uses $this_scope_compute_repeat_rate at L332-333 as if it were a method, then defines $compute closure below. Rename the call sites to $compute($start, $end, $statuses) — matches the definition. Cosmetic.

5. **Add explicit SELECT ... FOR UPDATE absence note** in threat model. Plans do not lock rows — readonly aggregations. Worth a one-liner in 16-02 threat_model to explicitly rule out concurrent-update concerns (trivial since everything is SELECT-only).

6. **16-03 coexistence test Maxi URL:** L601 guesses /wp-json/mcp/maxi-ai. Before running, add a ddev wp eval probe to confirm actual route, or inspect Maxi source. Script already handles SKIP gracefully if unreachable, but one-line pre-verification would be cleaner.

---

## Summary of Scoring

| Dimension | Status |
|-----------|--------|
| Requirement coverage (20/20 REQ-IDs) | PASS |
| Research fidelity (Findings 1-8) | PASS — all 8 honored |
| SQL correctness (HPOS, prefix, joins, TZ) | PASS |
| Acceptance criteria (value expectations) | PASS |
| Phase 17 handoff | PASS |
| Risk and rollback | PASS |
| Format and dependencies | PASS |
| CLAUDE.md compliance | PASS — no portal code touched; WP plugin scope |
| Scope sanity | PASS — 16-01 has 2 tasks, 16-02 has 2 tasks (grouped by risk pair), 16-03 has 3 tasks including human checkpoint. Line counts reasonable. |
| Context compliance | N/A — no CONTEXT.md for Phase 16; planner derived from REQUIREMENTS.md as documented in RESEARCH User Constraints section |

**Blockers:** 0
**Warnings:** 2 (Fix #1 SQL alias bug, Fix #2 label clarity)
**Info:** 6 optional improvements

**Verdict: APPROVE.** Apply Fix #1 and Fix #2 as pre-execution revisions. Plans are ready to ship.
