# Maxi AI Core v3 — Operational Playbook

This file contains the behavioral rules, workflows, and operational knowledge every agent must read on first connection. For architecture, security internals, and development guidelines, see PLAYBOOK-DOC.md.

---

## Rules

- Always read existing content **before** updating — never overwrite blindly.
- Never delete a user.
- When updating content, only send the fields you intend to change.
- Content must be valid Gutenberg block HTML.
- **Ability rules are enforced server-side.** Rules are delivered inline via `_meta._rule` on the first response for a gated ability (either the success or the `rules_not_acknowledged` rejection, depending on the rule's `delivery_mode`). Read the rule body when it arrives and retain it for the session. See [Ability Rules Handshake](#ability-rules-handshake) below.
- **Write abilities require administrator.** Non-admin agents cannot modify content — this is PHP-enforced. See [Write Gate](#write-gate).

---

## Session Start

Call `maxi/bootstrap-session` before any other ability. This is server-enforced — all other abilities are blocked until bootstrap is acknowledged. Bootstrap returns:

- **Operational playbook** — rules, workflows, content guards. Read it.
- **Active operator-notes** — authoritative operator instructions. Read and obey them.
- **Active knowledge-note headers** — id, title, topic, priority. Scan these before starting any task (see below).
- **Available reference docs** — on-demand docs fetchable via `maxi/get-playbook`.

### Using Knowledge

Before starting a task, scan the knowledge note headers from bootstrap. If any title matches the task you are about to perform, call `maxi/get-note` to read it and apply the documented solution. This avoids re-solving problems that have already been figured out.

When the operator asks you to save knowledge (e.g. "Save this as knowledge"), create an `agent-knowledge` note capturing the problem, solution, and context. The title must clearly describe the task or scenario — it is used for context matching in future sessions. Vague titles make knowledge invisible.

### Agent Identity

Your identity is `agent-{user_id}@{site_slug}` — derived from `maxi/get-current-user` (user ID) and the site you are connected to. Use this identifier when writing notes, commenting, or any communication where authorship matters. This format is consistent across all sites and requires no configuration.

---

## Notes System

Persistent knowledge and communication system for agents and operators.

### Fields

- **type:** `agent-knowledge`, `agent-note`, `operator-note`
- **status** (per type):
  - `agent-note`: `open`, `acknowledged`, `verify`, `fix`, `resolved`, `archived`
  - `operator-note`: `review` (drafting), `active` (live instruction), `idle` (temporarily disabled), `archived`
  - `agent-knowledge`: `review` (pending approval), `active` (use this), `idle` (outdated/disabled), `archived`
- **topic:** `bug`, `optimization`, `how-to`, `policy`, `warning`, `feedback`
- **priority:** `low`, `normal`, `high`, `critical`
- **assigned_to:** WordPress user ID (optional). When set, only that agent should act on the note. When null, any agent can act.

### Status Transitions

All status transitions are **PHP-enforced**. Invalid transitions are rejected with an error listing valid targets from the current state. `archived` is terminal — no outbound transitions.

### Processing Notes

- **Operator-notes** returned by `maxi/bootstrap-session` are authoritative instructions — read and obey them directly. Do NOT change operator-note status autonomously. You may create or update operator-notes only when explicitly instructed by the operator. Comments on operator-notes are non-authoritative.
- When you are the **dev-agent reviewing `agent-note` bug reports**, acknowledge them on read to signal the report has been seen.
- **agent-note flow:** Status transitions are PHP-enforced: `open` → `acknowledged` → `verify` → `resolved`/`fix`. `fix` loops back to `verify`. `archived` is reachable from any state but is terminal. After acting on a note, update its status via `maxi/update-note`. Use `verify` when the code change is done — do NOT skip to `resolved`. A note with status `verify` means you MUST run a test to confirm the fix works before marking it `resolved`. If verification fails, set status to `fix`. Invalid transitions are rejected with the list of valid targets.
- **agent-knowledge flow:** Knowledge notes start as `review`. Only administrators can change agent-knowledge status — agents must not change it. The operator reviews and sets to `active` (approved for use) or `idle` (not relevant). When knowledge becomes outdated, the operator moves it to `idle`. Use `archived` to permanently retire. This is the maker-checker pattern: agents create, operators approve. This is PHP-enforced.
- **operator-note flow:** Operator-notes start as `review` (drafting). The operator sets to `active` when the instruction is live. Use `idle` to temporarily disable, `archived` to permanently retire. Agents must not change these statuses autonomously.
- **operator-note live refresh:** Every ability response includes `_meta.operator_notes_revision`. At bootstrap, record `data.operator_notes_revision` as your baseline. If a later response's `_meta.operator_notes_revision` is higher than your baseline, **before your next tool call** run `maxi/list-notes` with `type=operator-note, status=active` to pull the current instructions, apply them going forward, and update your baseline. The in-flight request is not blocked — this is a soft signal, not a gate.
- **knowledge-note live refresh:** Every ability response also includes `_meta.knowledge_notes_revision`. At bootstrap, record `data.knowledge_notes_revision` as your baseline. If a later response's `_meta.knowledge_notes_revision` is higher than your baseline, **before your next tool call** run `maxi/list-notes` with `type=agent-knowledge, status=active` to refresh your knowledge-note headers and update your baseline. Same soft-signal semantics as operator-notes — the in-flight request is not blocked. Use the refreshed headers the same way you use bootstrap's: scan titles against the current task and call `maxi/get-note` when one matches.
- Prefer `status: archived` over `maxi/delete-note` — archived notes preserve history.
- When reviewing an **agent-note**, always read its comments (`maxi/get-note` includes the last 20). Comments may contain corrections, test results, or context that changes how you should act on the note.
- Use `maxi/add-note-comment` to reply when you have new information the note author needs to see (test results, clarifications, disagreements). Don't comment just to say "I read this" — status changes speak for themselves.

### Surfacing Friction & Capturing Knowledge

Stay alert to two moments worth flagging to the operator:

**Friction you hit.** If a task felt inefficient, confusing, or repetitive — an ambiguous rule, an ability that needed multiple round-trips, a misleading error, busywork — mention it in your response and offer to log it as an `agent-note` (topic `bug` or `optimization`).

> Example: "I had to call `maxi/get-meta` three times to gather data one call could return. Want me to log this as an optimization note?"

> Example (worked-but-clunky): asked which products are missing Yoast title/description, you queried all products + all meta rows and manually scanned for empties. It worked, but a targeted "return only rows where the key is NULL/empty" query would have been cleaner. Mention it and offer to log an optimization note.

**Problems you solved the hard way.** If you struggled through a non-obvious task and eventually figured it out — an unusual query pattern, a gotcha in an ability, a sequence of steps that wasn't documented — offer to save it as an `agent-knowledge` note so future agents don't re-solve it.

> Example: "Getting the correct order total required combining `list-orders` with `get-meta` on the `_order_total` key. Want me to save this as knowledge?"

**Friction is broader than failure.** Do NOT restrict this to cases where a tool errored or a call was blocked. A task that succeeded can still be friction-worth-surfacing. Common smells that usually indicate friction even when nothing failed:

- You used a broader or noisier query than the task required, and inspected the output manually.
- You inferred or counted by eye from verbose results when a targeted query could have returned the answer directly.
- You needed a workaround because the clean path was blocked, rejected, or awkward.
- You repeated similar calls that could reasonably have been combined.
- The final answer depended on a fragile manual interpretation of tool output.

These are hints, not a mandatory checklist — use them to recalibrate the threshold when the task technically succeeded.

**Quality bar.** Offer a note only if you would mention the friction casually to a colleague ("btw, this was a bit clunky because…"). Do not offer one for every micro-inefficiency — mechanical offers become noise the operator tunes out.

**In both cases: do not create the note autonomously.** Mention it, offer it, let the operator decide.

### Note Formatting

Use markdown in note content. Start with a one-line summary. Use bullet points for steps or lists. Use code blocks for commands, SQL, or file paths. Be clear, accurate, and detailed on the important things — but cut filler.

---

## Content Format

Page content must be valid **Gutenberg block markup**. Examples:

```html
<!-- wp:paragraph -->
<p>Text here.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Section Title</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3>Sub-heading</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li>Item one</li>
<li>Item two</li>
</ul>
<!-- /wp:list -->

<!-- wp:code -->
<pre class="wp-block-code"><code>code here</code></pre>
<!-- /wp:code -->

<!-- wp:table -->
<figure class="wp-block-table"><table><thead><tr><th>Col</th></tr></thead><tbody><tr><td>Val</td></tr></tbody></table></figure>
<!-- /wp:table -->

<!-- wp:heading {"anchor":"my-id"} -->
<h2 class="wp-block-heading" id="my-id">Anchored Heading</h2>
<!-- /wp:heading -->
```

---

## Licensing

Maxi AI Core ships in two paid tiers — **Lite** and **Pro**. Both require an active license. There is no free tier.

When a user asks about their license status, version, or tier — call `maxi/get-site-info`. It returns:

- `maxi_ai_version` — current plugin version.
- `maxi_ai_license.tier` — `lite`, `pro`, or `unlicensed`.
- `maxi_ai_license.status` — `active`, `grace_period`, `expired`, `inactive`, `invalid`, or `disabled`.
- `maxi_ai_license.entitlements` — array of feature-group names this license grants (e.g. `ai_generation`, `woocommerce_orders`, `analytics`). Scan this before planning a task — if the group you need isn't in the array, the ability will be gated.

**When an ability is gated**, the response's `reason` field tells you which path to surface to the user:

- **`plan_insufficient`** (fields: `required_group`, `plan`) — the license is valid, but the user's plan doesn't include the feature group this ability needs. Explain the upgrade path:
  1. Their current plan (`plan`) does not include `required_group`.
  2. Upgrade at https://maxicore.ai.
  3. After upgrading, the new plan takes effect on the next license refresh (up to 12 hours, or immediately via **Settings → Maxi AI → License**).

- **`license_required`** — no valid license. Explain the activation path:
  1. They need an active Maxi AI license (Lite or Pro depending on which abilities they want).
  2. Purchase at https://maxicore.ai.
  3. Activate via `maxi/activate-license` (if they give you the key) or direct them to **Settings → Maxi AI → License**.

To deactivate a license, use `maxi/deactivate-license`. This clears the stored key. After deactivation, only session-bootstrap and license-activation abilities remain callable — the rest require re-activation.

**Grace period:** when a license expires, abilities continue to work for 7 days with a warning appended to each successful response. Tell the user to renew before the grace window closes.

Do not guess or fabricate licensing details. Use `maxi/get-site-info` to check the current state.

---

## Ability Rules Handshake

Every gated ability delivers its rule to the agent before the ability is considered acknowledged for a session. Rules arrive **inline** on the response envelope under `_meta._rule` — you do not need a separate `maxi/get-ability-rule` round-trip in the common case. Two delivery modes are possible per rule:

- **`inline_on_success`** (descriptive rules) — the first call executes and the rule body is attached to the successful response under `_meta._rule`. Session state transitions to acknowledged. Subsequent calls in the same session pass through with no attached rule. If the first call fails for ability-specific reasons, the rule is NOT delivered and the next call restarts cleanly.
- **`reject_first`** (prescriptive or hybrid rules) — the first call is refused with `rules_not_acknowledged` AND the rule body is attached to that rejection under `_meta._rule`. Read it, then retry the same call — the retry is the acknowledgement, and the gate passes it through. The rule body is not re-attached on subsequent calls.

The rule's mode is visible in `_meta._rule.delivery_mode`.

**When `_meta._rule` arrives — what to do:**
1. Read the body (`_meta._rule.content`) before acting further on that ability.
2. Retain it for the rest of the session — it will not be re-delivered on later calls.
3. If the payload was a `rules_not_acknowledged` rejection, retry the original call with the corrected input.

**Version changes:** If an operator edits a rule mid-session, its `version` bumps and the next call to that ability will re-deliver `_meta._rule` according to the rule's current `delivery_mode`. Treat this as "the rule just changed — re-read it".

**`maxi/get-ability-rule` fallback:** Still fully supported for manual re-fetch, older agent versions, or when you want to inspect a rule without invoking its ability. Calling it explicitly marks the session as acknowledged at the fetched version.

If no rule exists for a gated ability, the gate returns `rules_not_installed` — call `maxi/rules-sync` to install baseline rules.

**Gate bypass:** `maxi/get-ability-rule`, `maxi/rules-sync`, and `maxi/bootstrap-session` are always callable (no deadlock).

**Ungated reads:** Safe read-only abilities skip the handshake entirely — no round-trip needed. See PLAYBOOK-DOC.md for the full list.

---

## Client Quirks

Different MCP clients surface structured server responses differently. This section documents known quirks and the workarounds that keep agents functional across clients. Scan it before your first gated call on a client you haven't used before.

### Generic "An error occurred while executing the tool"

Some MCP clients (notably Codex) collapse any `success: false` response into the single string `"An error occurred while executing the tool."`, hiding the structured `error`, `data.code`, and `_meta._rule` body. The server's response is structured and useful; your client is discarding it.

**What it actually means.** One of two things produced a response your client couldn't parse:

1. **Parameter name mismatch.** The caller used a parameter name that doesn't match the ability's `input_schema`. Common gotchas: `maxi/delete-note` / `maxi/update-note` / `maxi/get-note` all take `id` (not `note_id`). `maxi/get-ability-rule` takes `ability_id` (not `ability_name`). `maxi/get-attachment` / `maxi/delete-attachment` take `attachment_id`. When WP core's REST validator hits missing or unexpected params, it emits PHP warnings that pollute the HTTP response body and corrupt the JSON the client tries to parse.
2. **Rule handshake rejection.** The ability is `reject_first` gated and your client rendered the structured `rules_not_acknowledged` response (with the full rule body attached under `_meta._rule`) as the generic error string.

**What to do, in order:**

1. Double-check the parameter names against the ability's `input_schema`. Retry with corrected names.
2. If names were correct and the ability is gated, call `maxi/get-ability-rule { "ability_id": "<ability>" }` first. That ability is in the rule gate's ALLOWLIST — it is never itself gated and never produces this error. Its response marks the session as acknowledged, so the retry of the real ability passes through with no handshake round-trip.
3. If steps 1 and 2 both fail, inspect `maxi/get-audit-events` (category: `rules`) to see whether your retries reached the server at all.

### Codex-specific: prefetch only for reject_first abilities — not all reads

Codex's MCP client does not reliably deliver retry requests after a `reject_first` rejection (verified against server-side audit log — claimed retries produce zero additional requests). The workaround is to prefetch `maxi/get-ability-rule` before the first call, but **only for abilities that actually use `reject_first`**. Reads don't — over-prefetching them is wasted round-trips.

**Two delivery modes exist. Treat them differently:**

- **`inline_on_success` (descriptive rules).** The ability runs on first call. Rule body arrives attached to the successful response under `_meta._rule`. No reject, no prefetch needed. **All `get-*`, `list-*`, `search-*` abilities use this mode** (including `get-note`, which is classified as a read even though it has session side-effects). Call them directly.
- **`reject_first` (prescriptive rules).** The first call is refused with `rules_not_acknowledged` and the rule body is attached to the rejection under `_meta._rule`. The agent must read the rule and retry. **Write and mutation abilities use this mode**: `create-*`, `update-*`, `delete-*`, `assign-*`, `remove-*`, `set-*`, `bulk-*`, `generate-*`, `upload-*`, `attach-*`, `detach-*`, `cancel-*`, `rotate-*`, `activate-*`, `deactivate-*`, `send-*`, `regenerate-thumbnails`, `manage-*`, `register-categories`, `run-wp-cli`.

**For Codex specifically:** prefetch only for the `reject_first` set above. Skip prefetch for reads. If a read call ever unexpectedly returns `rules_not_acknowledged`, that means an operator has written a custom rule for that ability with blocking delivery mode — prefetch that specific ability once and retry; the session then passes through normally.

**For Claude and other MCP clients that render structured errors cleanly:** no prefetch is needed in either mode. On `reject_first`, read the attached `_meta._rule` body from the rejection envelope and retry. The retry is the acknowledgement; subsequent calls pass through.

### Parameter-name discipline applies to all clients

Even on clients that render structured errors correctly, a wrong parameter name triggers PHP validator warnings that can corrupt the response. Always match the exact names from each ability's `input_schema.properties` keys. When in doubt, call `maxi/get-ability-rule` — the rule body documents the correct parameters.

---

## Write Gate

Content-mutating abilities require `manage_options` (administrator) when called via MCP. This is PHP-enforced — no rule can override it.

**Write-gated abilities:**
- `maxi/update-content`, `maxi/create-content`, `maxi/delete-content`
- `maxi/duplicate-content`, `maxi/change-status`, `maxi/schedule-content`
- `maxi/set-author`, `maxi/set-parent`

**Not write-gated** (any authenticated role):
- Notes abilities (create-note, update-note, add-note-comment) — editors can submit suggestions
- All read abilities
- System abilities (get-ability-rule, rules-sync, etc.)

Non-admin agents are **read-only + notes-only** for content.

---

## Content Guards

PHP-enforced integrity checks on content mutations:

- **Per-post capability checks** — Checks permission on the *specific* post, not just generic `edit_posts`. An author cannot edit another author's post.
- **Read-before-write** — `maxi/update-content` with a `content` field requires that `get-content` or `get-content-by-slug` was called for that post in the current session. Title-only or status-only updates are not affected.
- **Gutenberg block validation** — Content must have valid block markup: at least one `<!-- wp:blockname -->`, balanced opening/closing tags, matching per-block counts.
- **Author validation** — Author user IDs are validated before writing.
- **Date format validation** — Dates must match `Y-m-d H:i:s` format exactly.
- **Note ownership** — Only the original author or an admin can modify note content. Status, topic, and priority changes are allowed from anyone.
- **Read-before-status-change (consume-on-use)** — `maxi/update-note` with a real status transition (not a same-status no-op) requires that `maxi/get-note` (or `maxi/create-note`) was called for that note in the current session. Each successful status transition consumes the read flag — forcing a re-read before the next transition. The check blocks the entire mutation, not just the status part — no fields are written if the read check fails.

---

## Error Handling

- All errors are returned in the `error` field of the response.
- All errors are also logged server-side to the PHP error log with the prefix `[Maxi AI]`.
- If an ability returns `"success": false`, do **not** retry blindly — read the error message and fix the input.

---

## Accuracy

When asked to count or enumerate items, count each one individually. Never estimate or summarize a group.

---

## WooCommerce Analytics

There are no dedicated WooCommerce analytics CLI commands. To answer questions about revenue, top products, or order trends, use `maxi/list-orders` with date filters and compute metrics from the returned data. For per-product sales, check `total_sales` via `maxi/get-meta` on the product. Do not suggest `wc report` — it does not exist.
