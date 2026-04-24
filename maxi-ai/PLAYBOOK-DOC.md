# Maxi AI Core v3 — Architecture & Reference

*Reflects Maxi AI Core 3.4.6.*

This file contains technical details, security documentation, extensibility guides, and development conventions. Read PLAYBOOK-INIT.md first for operational rules and workflows. Refer to this file when you need architectural understanding, security details, or are developing the plugin itself.

---

## Available Abilities (Detailed)

All abilities are called through the MCP adapter using `mcp-adapter-execute-ability`.
Every response follows this format:

```json
{ "success": bool, "data": { ... }, "error": "string or null" }
```

**Listing conventions.** Most `list-*` abilities accept optional `orderby` (e.g. `date`, `title`, `modified`, `rand`, plus type-specific values like `priority` for notes or `price` for products), `order` (`ASC`/`DESC`, case-insensitive), `per_page`, and `page` parameters. When `orderby: rand` is used the `order` parameter has no effect — random ordering has no direction. See each ability's input schema for its supported enum values.

### Content Abilities

| Ability | Description | Capability |
|---|---|---|
| `maxi/create-content` | Create a new post, page, or CPT entry. | `edit_posts` |
| `maxi/get-content` | Get a single post/page by ID. | `read` |
| `maxi/get-content-by-slug` | Get a post/page by URL slug. | `read` |
| `maxi/update-content` | Update any post/page fields. Send only fields to change. | `edit_posts` |
| `maxi/delete-content` | Delete or trash a post/page. | `delete_posts` |
| `maxi/list-content` | List posts/pages with filters (type, status, author, parent). | `read` |
| `maxi/search-content` | Search by `search` term, taxonomy, meta, author, date range. Searches all post types by default. | `read` |
| `maxi/duplicate-content` | Duplicate a post with all meta and terms. | `edit_posts` |
| `maxi/change-status` | Change status (publish, draft, pending, private, trash). | `edit_posts` |
| `maxi/schedule-content` | Schedule for future publication. | `publish_posts` |
| `maxi/set-author` | Change the author. | `edit_others_posts` |
| `maxi/set-parent` | Set/remove parent (hierarchical types only). | `edit_pages` |

All content abilities accept `post_type` to work with any registered type (page, post, product, etc.).

### Taxonomy Abilities

| Ability | Description | Capability |
|---|---|---|
| `maxi/create-term` | Create a term in any taxonomy. | `manage_categories` |
| `maxi/get-term` | Get a term by ID. | `read` |
| `maxi/update-term` | Update a term (name, slug, description, parent). | `manage_categories` |
| `maxi/delete-term` | Delete a term. | `manage_categories` |
| `maxi/list-terms` | List terms with filters (parent, search, order). | `read` |
| `maxi/assign-terms` | Append terms to a post (keeps existing). | `edit_posts` |
| `maxi/remove-terms` | Remove specific terms from a post. | `edit_posts` |
| `maxi/set-terms` | Replace all terms on a post for a taxonomy. | `edit_posts` |

Works with any taxonomy: category, post_tag, product_cat, or custom.

### Yoast SEO Abilities

| Ability | Description | Capability |
|---|---|---|
| `maxi/set-yoast-term-seo` | Set Yoast SEO title and/or meta description for a taxonomy term. Creates the `wpseo_taxonomy_meta[taxonomy][term_id]` record if it does not exist yet, merges with any existing Yoast keys (canonical, noindex, linkdex, content_score) instead of overwriting, and syncs the matching `wp_yoast_indexable` row when Yoast Indexables are available. | `manage_categories` |

Requires Yoast SEO plugin active (`WPSEO_VERSION` defined). Returns `indexable_synced: true` when the Indexables repository was reachable and written; the legacy option is always written regardless.

### Meta Abilities

| Ability | Description | Capability |
|---|---|---|
| `maxi/get-meta` | Get a single meta value, or all meta for an object. | `read` |
| `maxi/set-meta` | Set (add or update) a single meta value. | `edit_posts` |
| `maxi/delete-meta` | Delete a meta key. | `edit_posts` |
| `maxi/list-meta` | List all meta keys/values (with optional hidden key filter). | `read` |
| `maxi/bulk-update-meta` | Set multiple key-value pairs in one call. | `edit_posts` |

All meta abilities accept `object_type` (`post`, `term`, or `user`) and `object_id`.

#### Meta Values

- When setting meta values using the `set-meta` ability, always pass **plain/unserialized values**. WordPress handles serialization automatically. Never pre-serialize values (e.g., pass `test-class` not `a:1:{i:0;s:10:"test-class";}`), as this causes double serialization and corrupted data.
- For menu item properties (classes, target, xfn), prefer using `menu item update` WP-CLI command with the appropriate flag (e.g., `--classes=`, `--target=`) instead of setting meta directly.
- Request the menu_item_parent field from the start to display the hierarchy accurately

### Media Abilities

| Ability | Description | Capability |
|---|---|---|
| `maxi/upload-attachment` | Upload any file from URL or base64-encoded payload with title, alt text, caption, parent. Provide either `url` or `filename` + `content_base64`. | `upload_files` |
| `maxi/upload-image` | Upload image from URL or base64 payload (simple, images only). Provide either `url` or `filename` + `content_base64`. | `upload_files` |
| `maxi/get-attachment` | Get full attachment details (metadata, sizes, MIME type). | `read` |
| `maxi/delete-attachment` | Permanently delete an attachment and its files. | `delete_posts` |
| `maxi/list-attachments` | List attachments with filters (MIME type, parent, search). | `read` |
| `maxi/set-featured-image` | Set or remove featured image on a post. | `edit_posts` |
| `maxi/attach-media` | Attach a media item to a parent post. | `edit_posts` |
| `maxi/detach-media` | Detach a media item (make unattached). | `edit_posts` |
| `maxi/regenerate-thumbnails` | Regenerate all image sizes for an attachment. | `upload_files` |

### System Abilities

| Ability | Description | Capability |
|---|---|---|
| `maxi/get-site-info` | Site name, URL, language, timezone, WP version, Maxi AI version and license status. | `read` |
| `maxi/activate-license` | Activate a Maxi AI license key on this site (Lite or Pro). | `manage_options` |
| `maxi/deactivate-license` | Deactivate the current license. After deactivation only `session_system` and `licensing` abilities remain callable. | `manage_options` |
| `maxi/get-site-instructions` | Contents of CLAUDE.md. | `read` |
| `maxi/get-current-user` | Current authenticated user details and roles. | `read` |
| `maxi/get-post-types` | List all registered post types with supports/taxonomies. | `read` |
| `maxi/get-taxonomies` | List all registered taxonomies with associated post types. | `read` |
| `maxi/get-ability-rule` | Fetch the site rule for a Maxi AI ability and mark it acknowledged for the current MCP session. Call this before the first use of any gated ability. | `edit_posts` |
| `maxi/rules-sync` | Install or refresh baseline ability rules shipped with the plugin. Call when an ability returns `rules_not_installed`. | `edit_posts` |
| `maxi/manage-ability-rules` | Operator CRUD for site-level ability rules. Actions: `list`, `get`, `upsert`, `delete`. Hidden from MCP (`mcp.public = false`) — operator-only. | `manage_options` |
| `maxi/manage-playbooks` | Operator CRUD for site-level playbooks. Actions: `list`, `get`, `upsert`, `delete`. Required playbooks cannot be deleted. Hidden from MCP (`mcp.public = false`) — operator-only. | `manage_options` |
| `maxi/list-files` | **[PRO]** List files and subdirectories inside `wp-content/`. Returns names, sizes, modification dates, and subfolder listing for navigation. Supports glob patterns (`*.log`, `fatal-*`) and sorting by name or date. | `manage_options` |
| `maxi/read-file` | **[PRO]** Read any file inside `wp-content/`, including PHP source code for debugging. Blocked: sensitive filenames (wp-config.php, .env, .htaccess) and dangerous extensions (.sql, .pem, .sh). Max 500 KB, use `tail_lines` for large logs. | `manage_options` |
| `maxi/send-email` | **[PRO]** Send an email via `wp_mail()`. Disabled by default — enable by setting `maxi_ai_email_security` option to `admin` or `open` (or define `MAXI_AI_EMAIL_SECURITY` constant). "From" identity controlled by `maxi_ai_email_from` option: `wordpress` (site title + admin email), `woocommerce` (WC sender settings), or `user` (current user). Can be overridden per-email. Supports text and HTML format. Every send is audit-logged. | `is_user_logged_in` |
| `maxi/manage-mask-fields` | **[PRO]** Add, remove, or list field names in the GDPR data masking list. Any ability response key matching a masked field has its value partially redacted (e.g. "John" → "J***") before reaching the agent. Seeded with common PII fields by default. | `manage_options` |

### Analytics Abilities

Requires the **Maxi Web Analytics** plugin to be active for the `server` provider. Analytics data includes page views, traffic sources (referrer, UTM parameters), and conversion rates when combined with WooCommerce order data.

| Ability | Description | Capability |
|---|---|---|
| `maxi/get-analytics` | **[PRO]** Query page view analytics. Report types: `views` (total/time-grouped views for a post), `top-posts` (most viewed posts by type), `sources` (traffic source breakdown with UTM data), `conversions` (view-to-purchase rates for WooCommerce products). Supports date ranges, grouping by day/week/month, and result limits. | `manage_options` |
| `maxi/manage-analytics-settings` | **[PRO]** View or update analytics configuration. Set the analytics provider: `server` (Maxi Web Analytics local tracking) or `ga4` (Google Analytics 4 — coming soon). Shows provider availability status. | `manage_options` |

### AI Abilities

Batch AI processing with provider abstraction, job queue, retry logic, and background execution via WP Cron.

| Ability | Description | Capability |
|---|---|---|
| `maxi/update-ai-settings` | Update AI configuration (API keys, provider selection, retry/batch config). Merges with existing settings — only send fields to change. Keys are masked in the response. Credential writes are recorded in the audit log. | `manage_options` |
| `maxi/get-ai-settings` | Return the current non-credential AI configuration (default providers per capability, retry tuning, batch/worker tuning, HTTP timeout, `openai_org_id`, `local_endpoint`). API keys are omitted — use `list-provider-keys` for credential state. | `manage_options` |
| `maxi/rotate-provider-key` | Rotate a provider API key (or the local endpoint URL). Validates the new credential with a live test call before overwriting the old one — on failure the old key stays in place and a `validation_failed` event is logged. On success a `rotated` event is logged. | `manage_options` |
| `maxi/list-provider-keys` | List all AI provider credentials with masked key prefixes, rotation timestamps, age in days, last-used timestamps, and a stale flag (keys older than 180 days). Never returns raw keys. | `manage_options` |
| `maxi/get-audit-events` | Query the Maxi AI audit log. Returns append-only events across all categories (`key`, `license`, `content`, `notes`, `wp_cli`, `email`, `data_masking`, `rules`). Filter by category, event name, or a since timestamp. | `manage_options` |
| `maxi/generate-text-ai` | Generate text synchronously — returns content immediately. Supports OpenAI (GPT), Anthropic (Claude), OpenRouter (multi-model aggregator), and local providers. | `edit_posts` |
| `maxi/generate-text-ai-batch` | Submit a batch text generation job for multiple prompts. Returns job ID — use get-job-status to check progress. | `edit_posts` |
| `maxi/generate-image-ai` | Generate a single image synchronously — returns attachment immediately. Supports OpenAI (DALL-E 3, gpt-image-1), Replicate, BFL, and local providers. Optional `seed` for reproducibility and `background` (`transparent`/`opaque`/`auto`) — `transparent` produces a real RGBA PNG via gpt-image-1. | `upload_files` |
| `maxi/generate-image-ai-batch` | Submit a batch image generation job. Returns job ID immediately — images are generated in the background and sideloaded into the media library. | `upload_files` |
| `maxi/edit-image-ai` | Edit an existing image using AI. Mask is optional for OpenAI gpt-image-1 (default) and BFL Kontext — just describe the change in the prompt. Mask is required only for BFL Flux Fill and Replicate flux-fill-pro (precision inpainting). For background removal use `background: "transparent"` with the OpenAI provider. | `upload_files` |
| `maxi/get-job-status` | Get the status and progress of an AI batch job, including all items and their outputs. | `edit_posts` |
| `maxi/cancel-job` | Cancel a pending or running AI batch job. | `edit_posts` |

Supported AI providers: **OpenAI** (DALL-E 3, gpt-image-1 with transparent-background support, GPT, Vision), **Anthropic/Claude** (text, vision), **OpenRouter** (text, vision — multi-model aggregator, OpenAI-wire-compatible, one key for dozens of upstream models via vendor-prefixed slugs like `openai/gpt-4o-mini`, `anthropic/claude-sonnet-4-20250514`, `google/gemini-pro-vision`), **Replicate** (Flux models including flux-fill-pro), **BFL** (Black Forest Labs direct API — Flux Pro, Flux Kontext Pro, Flux Fill Pro), **Local** (self-hosted). Per-capability provider config (`provider_image`, `provider_edit_image`, `provider_text`, `provider_vision`) with automatic fallback. The default provider for image editing is OpenAI because it's the only one that supports maskless instruction-based editing *and* real alpha transparency in the same call. OpenRouter is **explicit-only** — never added to default fallback chains, to avoid cascade loops (e.g. OpenAI → OpenRouter routing back to OpenAI upstream). Call it with `provider: "openrouter"`; omitting the `model` defaults to `openai/gpt-4o-mini`. OpenRouter does not support image generation or editing — those calls return `not_supported`.

### Notes Abilities

| Ability | Description | Capability |
|---|---|---|
| `maxi/create-note` | Create a note. Types: `agent-knowledge` (reusable how-tos, workarounds), `agent-note` (bug reports, feedback, suggestions), `operator-note` (operator instructions to agents). Optional topic, priority, and `assigned_to` (user ID). | `is_user_logged_in` |
| `maxi/list-notes` | List and search notes. Filter by type, status, topic, priority, assigned_to, or free-text search. Use `exclude_status` to hide resolved/archived. Use `assigned_to: 0` for unassigned notes. Paginated. | `is_user_logged_in` |
| `maxi/get-note` | Read a single note by ID. | `is_user_logged_in` |
| `maxi/update-note` | Update a note's title, content, status, topic, priority, or assignment. Status transitions are PHP-enforced per type. For agent-notes: `open` → `acknowledged` → `verify` → `resolved`/`fix`. For agent-knowledge: admin-only (maker-checker). `archived` reachable from any state, terminal. | `is_user_logged_in` |
| `maxi/delete-note` | Permanently delete a note. Prefer `status: archived` over deletion. | `manage_options` |
| `maxi/add-note-comment` | Post a comment on a note. Use to reply to bug reports, provide verification results, or add context. Comments are append-only. | `is_user_logged_in` |
| `maxi/list-note-comments` | List comments on a note in chronological order. Use when a note has more than 20 comments and you need to paginate. | `is_user_logged_in` |

**Operator-notes live refresh (soft signal).** Every ability response includes `_meta.operator_notes_revision` — a monotonically increasing counter stored in `wp_options` (`maxi_ai_operator_notes_revision`). `create-note`, `update-note`, and `delete-note` atomically bump it when the affected note is an `operator-note`. Bootstrap returns the current value as `data.operator_notes_revision`, which the agent records as its baseline. On any later response, if `_meta.operator_notes_revision` exceeds the baseline, the agent re-lists active operator-notes before its next tool call and updates its baseline. The in-flight request is NOT blocked — this is a soft signal, not a gate. Complements the hash-based hard-freshness check in the Playbook Gate.

**Knowledge-notes live refresh (soft signal).** Symmetric with operator-notes. Every ability response includes `_meta.knowledge_notes_revision` — a monotonically increasing counter stored in `wp_options` (`maxi_ai_knowledge_notes_revision`). `create-note`, `update-note`, and `delete-note` atomically bump it when the affected note is `agent-knowledge`. Bootstrap returns the current value as `data.knowledge_notes_revision`. The agent records this as its baseline and, on any later response where the value exceeds the baseline, re-lists active knowledge-note headers via `maxi/list-notes` with `type=agent-knowledge, status=active` (headers only — no content fetched). The agent then scans the refreshed titles against the current task, same as it does with bootstrap headers. Helpers: `maxi_ai_knowledge_notes_revision_get()` and `maxi_ai_knowledge_notes_revision_bump()` in `includes/helpers.php`. Without this signal, knowledge-notes activated mid-session would be invisible to the running agent — the playbook instruction is the only thing that makes the agent act on the bump.

### Development Abilities

| Ability | Description | Capability |
|---|---|---|
| `maxi/run-wp-cli` | Execute a WP-CLI command. Prefix-based allowlist: read-only commands always allowed, write groups opt-in via `wp-config.php` constants, hard-banned commands always rejected. `DB_READS` group allows SELECT-only `db query` with output blocklist and `db export` for database backups. `PLUGIN_WRITES`/`THEME_WRITES` groups enable plugin/theme management with tiered `INSTALL`/`DELETE` sub-constants. `TRANSLATION_UPDATES` group enables language pack updates. | `manage_options` |
| `maxi/manage-db-query-blocklist` | Add, remove, or list terms in the DB query output blocklist. Seeded with defaults (`user_pass`, `user_activation_key`, `session_tokens`) on first use. Blocked terms cause `db query` SELECT commands to be rejected if the term appears in the SQL text or in the query output. | `manage_options` |
| `maxi/flush-cache` | Flush the WordPress object cache. | `manage_options` |
| `maxi/clear-transients` | Delete expired transients or a specific transient by name. | `manage_options` |
| `maxi/regenerate-rewrites` | Flush and regenerate permalink rewrite rules. | `manage_options` |

### WooCommerce Abilities

Requires WooCommerce to be active. All abilities gracefully return an error if WooCommerce is not installed.

#### Products

| Ability | Description | Capability |
|---|---|---|
| `maxi/get-product` | Get a product with full WC data (prices, stock, attributes with taxonomy/term details, variations). Response includes a `price_range` object for variable products ({ regular_min, regular_max, sale_min, sale_max, min, max }; `null` for simple/grouped/external). | `edit_products` |
| `maxi/list-products` | List products with WC-specific filters (type, stock, price range, on-sale). Each item includes a `price_range` aggregate for variable products so price-summary queries don't need a follow-up `list-variations` call. | `edit_products` |
| `maxi/update-product` | Update WC product data (prices, stock, SKU, dimensions, visibility). | `edit_products` |

#### Variations

| Ability | Description | Capability |
|---|---|---|
| `maxi/get-product-attributes` | Get attribute configuration for a product (taxonomy vs custom, terms, variation flags). | `edit_products` |
| `maxi/set-product-attributes` | Set product attributes with automatic taxonomy detection. For taxonomy attributes (`pa_*`), `options` accepts term IDs, slugs, or names — existing terms are resolved by ID → slug → name before any new term is created (prevents `-2` slug duplicates). For custom attributes, stores plain strings. | `edit_products` |
| `maxi/create-variation` | Create a variation with attribute combination, price, stock, SKU. | `edit_products` |
| `maxi/update-variation` | Update a variation's attributes, price, stock, SKU, dimensions, or image. | `edit_products` |
| `maxi/delete-variation` | Delete a product variation permanently. | `edit_products` |
| `maxi/list-variations` | List variations of one or more variable products. Accepts `product_id` (single) or `product_ids` (batch, max 20 per call). Each variation item carries a `product_id` field identifying its parent. Optional `per_page`/`page` pagination; in batch mode pagination applies across the combined flat list. | `edit_products` |
| `maxi/set-product-type` | Convert a WooCommerce product between types (simple, variable, grouped, external). | `edit_products` |

#### Bulk Operations

| Ability | Description | Capability |
|---|---|---|
| `maxi/bulk-update-prices` | Update prices for multiple products/variations with exact or percentage adjustments. | `edit_products` |

#### Orders

| Ability | Description | Capability |
|---|---|---|
| `maxi/create-order` | Create an order with line items, customer, addresses, and status. | `manage_woocommerce` |
| `maxi/get-order` | Get full order details (items, totals, addresses, payment). | `manage_woocommerce` |
| `maxi/list-orders` | List orders with filters (status, customer, date range). | `manage_woocommerce` |
| `maxi/update-order-status` | Change order status with optional note. | `manage_woocommerce` |
| `maxi/add-order-note` | Add a private or customer-visible note to an order. | `manage_woocommerce` |

#### Coupons

| Ability | Description | Capability |
|---|---|---|
| `maxi/create-coupon` | Create a coupon with discount type, amount, limits, and restrictions. | `manage_woocommerce` |
| `maxi/get-coupon` | Get coupon details by ID or code, including usage stats. | `manage_woocommerce` |
| `maxi/update-coupon` | Update coupon amount, expiry, limits, or restrictions. | `manage_woocommerce` |
| `maxi/delete-coupon` | Delete a coupon permanently. | `manage_woocommerce` |
| `maxi/list-coupons` | List coupons with optional filters. | `manage_woocommerce` |

#### Shipping

| Ability | Description | Capability |
|---|---|---|
| `maxi/list-shipping-zones` | List all shipping zones with regions and methods, including each method's full instance settings (cost, tax_status, min_amount, ...). | `manage_woocommerce` |
| `maxi/create-shipping-zone` | Create a shipping zone with region restrictions. | `manage_woocommerce` |
| `maxi/add-shipping-method` | Add a shipping method to a zone (flat rate, free, local pickup). | `manage_woocommerce` |
| `maxi/update-shipping-method` | Update an existing shipping method instance — partial merge of `settings` (cost, tax_status, title, min_amount, requires, ...) and optional `enabled` toggle. Keys vary by method type; read via `list-shipping-zones` first. | `manage_woocommerce` |

#### Tax Rates

| Ability | Description | Capability |
|---|---|---|
| `maxi/create-tax-rate` | Create a tax rate for a country/state. | `manage_woocommerce` |
| `maxi/update-tax-rate` | Update an existing tax rate. Send only fields to change; booleans can be set to false. | `manage_woocommerce` |
| `maxi/list-tax-rates` | List tax rates with optional filters. | `manage_woocommerce` |
| `maxi/delete-tax-rate` | Delete a tax rate. | `manage_woocommerce` |

---

## Security

This plugin exposes powerful site-mutating capabilities over MCP. Running it safely requires attention to transport, credentials, user scoping, and a couple of specifically dangerous abilities.

### Transport

- **HTTPS everywhere.** All outbound provider calls (OpenAI, Anthropic, OpenRouter, Replicate, BFL) are hardcoded to HTTPS. Serve your WordPress site over HTTPS too — an MCP endpoint on HTTP exposes your WordPress application password in cleartext.
- **No HTTP admin warning yet.** If your site runs on HTTP the plugin will not currently nag you about it. Check `is_ssl()` in your own pre-deploy checks.

### Credential management

- **Encryption at rest.** Provider API keys are encrypted with `sodium_crypto_secretbox` (XSalsa20-Poly1305) using a key derived from `wp_salt('auth')` via BLAKE2b with domain separation. Encrypted values are stored as `enc:<base64(nonce + ciphertext)>` in the `maxi_ai_settings` option. Legacy plaintext keys are auto-migrated on first read. Encryption protects against database-only compromise (SQL injection, leaked backup). It does NOT protect if the attacker also has filesystem access to `wp-config.php`.
- **Where keys live.** Provider API keys are stored encrypted in the `maxi_ai_settings` WordPress option. They are never echoed to the frontend. API responses that include keys mask them as `first8...last4`.
- **Rotation.** Use `maxi/rotate-provider-key` to rotate a provider key. The ability validates the new key with a live test call before overwriting the old one — if validation fails, the old key stays in place and a `validation_failed` entry is written to the audit log.
- **Visibility.** `maxi/list-provider-keys` shows masked keys plus `last_rotated_at`, `last_used_at`, and an `age_days` field. Keys older than 180 days are flagged as stale.
- **Audit trail.** Every rotation, every key write via `maxi/update-ai-settings`, and every validation failure is logged to the `{$wpdb->prefix}maxi_ai_audit_log` table under category `key`. Query via `maxi/get-audit-events`.
- **Never commit secrets.** Neither provider keys nor WordPress application passwords should ever be committed to git. Make sure your deployment flow doesn't leak these another way.

### WordPress user scoping

Every MCP agent should be bound to its own WordPress user with only the capabilities it actually needs. The plugin enforces per-ability capability checks (see the [capability mapping table](#capability-mapping) under Agentic Development).

Recommended patterns:

- **Read-only agent** — WP user with `read` + `edit_posts`. Covers all list/get/describe abilities and safe drafting.
- **Content agent** — add `publish_posts`, `upload_files`, `manage_categories`. Covers creating content and media.
- **Store agent** — add `edit_products`, `manage_woocommerce`. Covers Woo work.
- **Admin agent** — add `manage_options`. **Only** when the agent legitimately needs to call `update-ai-settings`, `rotate-provider-key`, `run-wp-cli`, `flush-cache`, or similar. Prefer a scoped content/store user for everything else.

### Dangerous abilities

- **`maxi/run-wp-cli`** runs WP-CLI commands via `proc_open()` with an argv array (no shell interpretation). Shell metacharacters (`;`, `|`, `&`, `` ` ``, `$`, etc.) are rejected before execution — this accepts WP-CLI command text only, not shell command text. It is further gated by a strict prefix-based allowlist:
  - **Read-only commands** (`option get`, `post list`, `core version`, `wc tool list`, `wc log read`, etc.) are allowed by default with no configuration.
  - **Write commands** are blocked by default. To enable a group, define the corresponding constant in `wp-config.php`:
    - `define( 'MAXI_AI_WP_CLI_ALLOW_CACHE_WRITES', true );` — cache, transient, cron, rewrite flush
    - `define( 'MAXI_AI_WP_CLI_ALLOW_CONTENT_WRITES', true );` — post, term, menu writes
    - `define( 'MAXI_AI_WP_CLI_ALLOW_USER_WRITES', true );` — user create/update
    - `define( 'MAXI_AI_WP_CLI_ALLOW_OPTION_WRITES', true );` — option add/update/delete
    - `define( 'MAXI_AI_WP_CLI_ALLOW_DB_READS', true );` — `db query` with SELECT statements only (non-SELECT queries are rejected even with this constant) and `db export` for database backups. Useful for ad-hoc reporting queries and pre-change backups.
    - **DB Query Blocklist:** The blocklist (`maxi_ai_db_query_blocklist` wp_option) adds a second safety layer. It is **seeded automatically** with sensible defaults (`user_pass`, `user_activation_key`, `session_tokens`) the first time `MAXI_AI_WP_CLI_ALLOW_DB_READS` is enabled. Every `db query` is checked twice: **pre-execution** rejects if the SQL text contains a blocked term (catches `SELECT user_pass ...`); **post-execution** rejects if the query output contains a blocked term (catches `SELECT * FROM wp_users` where `user_pass` appears in results). Manage the blocklist via `maxi/manage-db-query-blocklist` (actions: `add`, `remove`, `list`). If you clear the blocklist manually, the defaults will not be re-added — your choice is respected. Both rejection types are audit-logged with reasons `db_query_blocklist_sql` and `db_query_blocklist_output`.
    - `define( 'MAXI_AI_WP_CLI_ALLOW_PLUGIN_WRITES', true );` — plugin activate, deactivate, update, toggle, auto-updates
    - `define( 'MAXI_AI_WP_CLI_ALLOW_PLUGIN_INSTALL', true );` — `plugin install`. **Requires `PLUGIN_WRITES` as prerequisite** — will not work on its own.
    - `define( 'MAXI_AI_WP_CLI_ALLOW_PLUGIN_DELETE', true );` — `plugin delete`. **Requires `PLUGIN_WRITES` as prerequisite** — will not work on its own.
    - `define( 'MAXI_AI_WP_CLI_ALLOW_THEME_WRITES', true );` — theme activate, update
    - `define( 'MAXI_AI_WP_CLI_ALLOW_THEME_INSTALL', true );` — `theme install`. **Requires `THEME_WRITES` as prerequisite** — will not work on its own.
    - `define( 'MAXI_AI_WP_CLI_ALLOW_THEME_DELETE', true );` — `theme delete`. **Requires `THEME_WRITES` as prerequisite** — will not work on its own.
    - `define( 'MAXI_AI_WP_CLI_ALLOW_TRANSLATION_UPDATES', true );` — `language core/plugin/theme update` and `language core/plugin/theme install`. Downloads official translation files from wordpress.org — no code execution risk.
  - **Hard-banned commands** (`db drop`, `eval`, `config set`, `user delete`, etc.) are rejected unconditionally and cannot be enabled by any constant.
  - **Emergency override:** `define( 'MAXI_AI_WP_CLI_UNSAFE', true );` bypasses the read-only and group checks, but the hard-banned list still applies. Development only.
  - **Rejections are audit-logged** to category `wp_cli` with the reason, matched prefix, and raw command. Query via `maxi/get-audit-events`.

- **`maxi/send-email`** sends real emails via `wp_mail()`. It is **disabled by default** and must be explicitly enabled:
  - Set the `maxi_ai_email_security` option to one of:
    - `off` (default) — ability is completely disabled
    - `admin` — only administrators can send
    - `open` — any authenticated user can send
  - Or lock it with `define( 'MAXI_AI_EMAIL_SECURITY', 'admin' );` in `wp-config.php` (constant overrides the option).
  - **"From" identity** is controlled by the `maxi_ai_email_from` option:
    - `wordpress` (default) — site title + admin email from Settings > General
    - `woocommerce` — sender name + email from WooCommerce > Settings > Emails
    - `user` — current user's display name + email (also sets Reply-To header)
  - The `from` parameter on each email overrides the global setting for that single send.
  - **Deliverability note:** if your SMTP plugin forces a specific sender address, the "from" setting may be overridden at the transport level. In `user` mode, a Reply-To header is always set so replies reach the user regardless.
  - **Every send is audit-logged** (recipient, subject, from identity — no body for privacy). Query via `maxi/get-audit-events` with category `email`.

### GDPR Data Masking

The plugin includes a field-level data masking layer that intercepts **all** ability responses before they reach the AI agent. Any response key whose name matches a field in the mask list has its value partially redacted:

- `"John Doe"` → `"J*** D**"` (first character visible, rest asterisked, per word)
- `"john@example.com"` → `"j***************"`

**Active by default.** On first plugin load, the mask list is seeded with common PII field names:

```
first_name, last_name, display_name, nickname, user_email, email, phone,
address_1, address_2, postcode, city, company,
billing_first_name, billing_last_name, billing_email, billing_phone,
billing_address_1, billing_address_2, billing_postcode, billing_city, billing_company,
shipping_first_name, shipping_last_name, shipping_phone,
shipping_address_1, shipping_address_2, shipping_postcode, shipping_city, shipping_company
```

**Managing the mask list:** Use `maxi/manage-mask-fields` (actions: `add`, `remove`, `list`) to customize which fields are masked. Changes are audit-logged under category `data_masking`.

**Disabling masking for development:** Define `MAXI_AI_DATA_MASKING` as `false` in `wp-config.php` to bypass masking entirely. Alternatively, clear the mask list via `maxi/manage-mask-fields` with action `remove`.

**How it works:** Matching is by exact leaf-key name at any nesting depth. If `first_name` is in the mask list, it catches both `billing.first_name` (nested WooCommerce order data) and top-level `first_name` (user meta). Only string values are masked — integers, booleans, and IDs pass through unchanged.

**Important:** Masking is pseudonymization, not full anonymization. It reduces PII exposure to the AI agent but does not eliminate all GDPR obligations. The masking filter runs regardless of license tier.

### Rate Limiting

Per-session rate limiting protects against runaway agents exhausting API credits or overwhelming the site. Limits are enforced by the Rule Gate for all MCP ability calls. Direct PHP, WP-CLI, and cron calls are not rate-limited.

**Three tiers:**

| Category | Default limit | Window | Abilities |
|---|---|---|---|
| `ai` | 10/min | 60s | `generate-text-ai`, `generate-text-ai-batch`, `generate-image-ai`, `generate-image-ai-batch`, `edit-image-ai` |
| `write` | 30/min | 60s | All content-mutating abilities not in `ai` or `read` |
| `read` | 120/min | 60s | All `get-*`, `list-*`, `search-*` abilities |

**Configuration via `wp-config.php` constants:**

| Constant | Default | Purpose |
|---|---|---|
| `MAXI_AI_RATE_LIMIT_READ` | `120` | Max read calls per window |
| `MAXI_AI_RATE_LIMIT_WRITE` | `30` | Max write calls per window |
| `MAXI_AI_RATE_LIMIT_AI` | `10` | Max AI generation calls per window |
| `MAXI_AI_RATE_LIMIT_WINDOW` | `60` | Window size in seconds |
| `MAXI_AI_RATE_LIMIT_DISABLED` | `false` | Set to `true` to disable rate limiting entirely |

When a limit is exceeded, the ability returns a `rate_limited` error with `retry_after` seconds. Rate limit events are logged at the `warning` level.

### Audit Log Integrity

The audit log uses SHA-256 hash chaining for tamper evidence. Each entry stores `entry_hash = SHA-256(previous_hash | ts | category | event | actor_id | subject | context)`. Modifying any historical entry breaks the chain from that point forward.

- **Verify integrity:** Call `maxi/verify-audit-chain` (requires `manage_options`). Returns whether the chain is intact and, if broken, the ID of the first tampered entry.
- **Legacy entries:** Entries created before hash chaining was added have empty `entry_hash` values. The chain gracefully bridges legacy entries by computing what their hashes would have been.

### Error Message Sanitization

All error messages returned by `maxi_ai_response()` are automatically sanitized before reaching the agent:

- Filesystem paths (`/var/www/...`, `C:\Users\...`, WordPress paths) → `[path]`
- PHP class/method references (`Class::method()`) → `[internal]`
- WordPress table names (`wp_*`) → `[table]`
- Truncated to 500 characters

The full unsanitized error is still logged server-side via `error_log()` for debugging.

### Things the plugin does NOT do

So there is no confusion about the current security posture:

- **No dry-run or read-only mode.** Write abilities execute immediately. Test against a staging site or a scoped read-only WP user.
- **No multisite hardening.** Per-site tables may leak on uninstall, and there's no network-level credential management.

---

## Licensing Architecture

### How It Works

- **Per-site licensing:** Each license key is activated per domain.
- **Paid-only:** Both Lite and Pro require an active license. There is no free tier. Unlicensed installs can only call `session_system` and `licensing` abilities — enough to bootstrap a session and activate a key.
- **Provider-agnostic:** The licensing backend (LemonSqueezy, Freemius, EDD, custom API) is a swappable connector. The core defines an interface (`Maxi_AI_License_Provider`) that any backend must implement.
- **Runtime gating:** Access checks are applied at execution time via callback wrapping — no ability code is modified.
- **Lazy loading:** Ability files are only loaded on REST API / MCP requests (via `rest_api_init`) and WP-CLI. Regular frontend, admin, and cron page loads never parse ability files.
- **Grace period:** When a license expires, entitlement-granted abilities continue to work for 7 days with a warning. After the grace period, they return a gated error.
- **Offline resilience:** If the remote license server is unreachable, the cached status is extended by 24 hours. No accidental lockout from transient network issues.

### Feature groups and plans

Access is gated by **feature groups**, not individual ability IDs. Every ability carries a `feature_group` tag in its registration meta (visible via `mcp-adapter-get-ability-info`). Plans declare which feature groups they include. A license grants a plan → resolves to a set of entitlement groups → the gate permits an ability when its `feature_group` is in that set.

**Always-free baseline** (no license required): `session_system`, `licensing`.

**Lite plan** adds: `content_read`, `content_write_basic`, `taxonomy`, `notes`, `media_basic`, `meta_basic`, `ai_settings_read`, `dev_tools_basic`.

**Pro plan** adds to Lite: `meta_bulk`, `ai_settings_write`, `ai_generation`, `analytics`, `dev_tools_admin`, `woocommerce_catalog`, `woocommerce_orders`, `woocommerce_coupons`, `woocommerce_shipping_tax`, `woocommerce_bulk`.

`media_ai` is reserved for future AI-generated-image-to-media-library flows.

The plan → groups map lives in `includes/licensing/class-entitlements.php::PLANS`. To change what a plan includes, edit that array — no other code changes needed. To move an ability between groups, edit its `feature_group` tag in its ability file's `meta` array.

**Legacy aliases:** older licenses carrying the historical `agency` plan are transparently mapped to `pro` via `PLAN_ALIASES` in the same file. No admin action required.

### Response shape for gated calls

The gate returns one of two distinct error codes so the agent can surface the right next step:

- **`plan_insufficient`** — license is valid but the plan doesn't include the required group. Payload carries `required_group` and `plan` fields. Prompt the user to upgrade.
- **`license_required`** — no valid license. Payload carries the `required_group` the ability needs. Prompt the user to activate or renew.

Both are audit-logged under category `license` with event `plan_insufficient`.

### Back-compat shims

`Maxi_AI_License_Tiers::is_pro()` and `Maxi_AI_License_Status::grants_pro()` are retained as deprecated shims through 3.4.x and removed in 3.5.0. Third-party code referencing them keeps working during the transition window.

### Client/server decoupling

The license server can return an explicit `entitlements: string[]` field in its validation response, in which case the client uses it verbatim. Otherwise the client derives entitlements from the `plan` string via the `PLANS` map above. This lets the license server ship `entitlements[]` support on its own schedule without coordinating with client deploys.

### Admin UI

Settings → Maxi AI License provides:
- License key input with activate/deactivate buttons
- Status badge (Active / Grace Period / Expired / Inactive)
- License details (domain, plan, expiry, last checked)
- Entitlements overview (which feature groups this plan grants)

### Constants

| Constant | Default | Purpose |
|---|---|---|
| `MAXI_AI_LICENSE_CHECK_INTERVAL` | `43200` (12h) | Remote validation cache TTL in seconds. Minimum 3600. |
| `MAXI_AI_UPDATE_URL` | `https://api.maxicore.ai/v1/updates/check` | Custom update server endpoint. |

### Registering a Custom Provider

Third-party plugins can register additional license providers:

```php
add_action( 'maxi_ai_register_license_providers', function () {
    Maxi_AI_License_Manager::register_provider( 'custom', new My_Custom_Provider() );
} );
```

The provider must implement `Maxi_AI_License_Provider` (see `includes/licensing/interface-license-provider.php`).

### License Events in Audit Log

All license events are recorded in the audit log under category `license`:
- `activated` — successful activation
- `activation_failed` — activation attempt failed
- `deactivated` — license deactivated
- Query via `maxi/get-audit-events` with `category: 'license'`.

### Content Events in Audit Log

All content mutations are recorded in the audit log under category `content`:
- `content_created` — new post/page created. Context: `post_type`.
- `content_updated` — post/page updated. Context: `updated_fields` (array of changed field keys).
- `content_deleted` — post/page deleted or trashed. Context: `force` (bool — permanent delete vs trash).
- `content_duplicated` — post/page duplicated. Context: `source_id` (original post ID).
- `status_changed` — post status changed. Context: `from`, `to` (old and new status).
- `content_scheduled` — post scheduled for future publication. Context: `date`.
- `author_changed` — post author changed. Context: `from`, `to` (old and new author user IDs).
- `parent_changed` — post parent changed. Context: `from`, `to` (old and new parent post IDs).
- Query via `maxi/get-audit-events` with `category: 'content'`.

---

## Ability Rules System

Site-level ability rules live in a dedicated `wp_maxi_ai_ability_rules` table, one row per ability. Rules are operational policy — they tell agents how to use an ability (workflow, constraints, anti-patterns). Enforcement is server-side: an agent cannot call a gated ability until it has fetched and acknowledged the rule for the current MCP session.

### How it works

1. Agent calls a gated ability (e.g. `maxi/update-content`).
2. Rule Gate checks if the session has acknowledged the rule. If not → returns `rules_not_acknowledged` error with instruction to call `maxi/get-ability-rule`.
3. Agent calls `maxi/get-ability-rule` with the `ability_id`. Response contains the full rule body. The session is marked as acknowledged.
4. Agent retries the original ability. Gate sees the acknowledgement and passes through.

If no rule exists for the ability, the gate returns `rules_not_installed` with remediation: call `maxi/rules-sync`.

### Always fail-closed

No rule = no execution. There is no permissive mode, no fallback, no tier exemption. Every gated ability must have a rule in the database. Fresh installs seed baseline rules from `includes/rules/default-rules.php` on activation.

### Rule sources

| Source | Origin | Sync behavior |
|---|---|---|
| `default` | Shipped with plugin in `includes/rules/default-rules.php` | Overwritten on plugin update / `rules-sync` |
| `operator` | Created via `maxi/manage-ability-rules` by site admin | **Never overwritten by sync** — operator wins |
| `docu` | Pulled from docu (Phase 2, not yet implemented) | Overwritten on next docu sync |

### Session cache

- Keyed by MCP session ID + ability ID, stored as WordPress transient.
- 30-minute TTL (tunable via `MAXI_AI_RULE_SESSION_TTL` constant, minimum 60s).
- Version-aware: if the operator updates a rule mid-session, the gate detects the version mismatch and forces a re-fetch (`rules_changed` error).
- Session ID is captured from every `WP_REST_Request` via a `rest_pre_dispatch` filter (priority 1) into a static on `Maxi_AI_Rule_Session`. The MCP adapter stores the `Mcp-Session-Id` header on its own request-context object and does **not** populate `$_SERVER['HTTP_MCP_SESSION_ID']`, so reading `$_SERVER` alone would miss every MCP call. The capture filter bridges that gap; `$_SERVER` remains as a fallback for non-REST edge cases.
- **CLI / cron → pass through.** When `WP_CLI`, `DOING_CRON`, or `php_sapi_name()` indicates a non-HTTP context (`maxi_ai_is_http_context()` returns `false`), a missing session ID is treated as a trusted in-process caller and the gate passes through.
- **HTTP + no session → fail closed.** In an HTTP request context with no captured session ID, both the playbook gate and the rule gate refuse with `mcp_session_missing`. The playbook gate emits a one-shot diagnostic log entry listing all `HTTP_*` keys so misrouted headers can be diagnosed without flooding the log.

### Gate bypass (ALLOWLIST)

These abilities are exempt from the rule gate to prevent deadlock:

- `maxi/get-ability-rule` — the handshake itself
- `maxi/rules-sync` — the recovery path when no rules exist

### Ungated reads (no handshake needed)

Safe read-only abilities skip the rule handshake by default. This eliminates one MCP round-trip per call — the agent can call them directly without first fetching the rule.

**Ungated reads:**
`list-content`, `search-content`, `get-term`, `list-terms`, `get-meta`, `list-meta`, `get-attachment`, `list-attachments`, `get-note`, `list-notes`, `list-note-comments`, `get-site-info`, `get-current-user`, `get-post-types`, `get-taxonomies`, `get-site-instructions`, `flush-cache`, `clear-transients`, `regenerate-rewrites`, `get-ai-settings`, `list-provider-keys`, `get-audit-events`, `get-job-status`, `get-analytics`.

**Still gated (meaningful rules or sensitive data):**
- `get-content` / `get-content-by-slug` — rules document the read-before-write side-effect
- All WooCommerce reads (`get-product`, `list-orders`, etc.) — operators may add store-specific rules
- `list-files` / `read-file` — filesystem access
- `verify-audit-chain` — admin-only
- All write and AI abilities

**Override:** Define `MAXI_AI_GATE_READS` as `true` in `wp-config.php` to force all reads through the full handshake. Use this if you've written meaningful rules for read abilities.

### Content Guards (PHP-enforced)

In addition to the write gate, content integrity and authorization checks are enforced in PHP:

**Per-post capability checks** — Every content write ability checks the user's permission on the *specific* post being modified (e.g. `current_user_can( 'edit_post', $post_id )`), not just the generic `edit_posts` capability. This prevents an author from editing another author's post even if both have `edit_posts`.

**Read-before-write** — If `maxi/update-content` is called with a `content` field but neither `maxi/get-content` nor `maxi/get-content-by-slug` was called for that `post_id` in the current MCP session, the server returns `content_not_read`. Title-only or status-only updates (no `content` field) are not affected. This prevents blind overwrites of page content.

**Gutenberg block validation** — If `maxi/update-content` or `maxi/create-content` sends a `content` field, it is validated for structural block markup: at least one `<!-- wp:blockname -->` must exist, every opening tag must have a matching `<!-- /wp:blockname -->`, and per-block-name counts must balance. Self-closing blocks (`<!-- wp:blockname /-->`) are handled correctly. Invalid markup returns `invalid_block_markup` with a descriptive error. Raw HTML without block wrappers would break the block editor.

**Author validation** — `maxi/update-content` and `maxi/create-content` validate that the `author` user ID exists before writing. Invalid author IDs return `Author not found`.

**Date format validation** — `maxi/update-content`, `maxi/create-content`, and `maxi/schedule-content` validate that `date` fields match `Y-m-d H:i:s` format exactly. Invalid dates return `Invalid date format`.

**Note ownership** — In `maxi/update-note`, if the `content` field is being changed, the server checks `current_user_id()` against the note's `author_id`. Only the original author or an administrator (`manage_options`) can modify note content. Status, topic, and priority changes are allowed from anyone. Violations return `note_ownership`.

**Audit logging** — All content mutations are logged to the audit trail under category `content`. See [Content Events in Audit Log](#content-events-in-audit-log).

### Gate stack (execution order)

At `wp_abilities_api_init`:
- Priority 1: Ability files are loaded (deferred from `rest_api_init`)
- Priority 10: Abilities register via `wp_register_ability()`
- Priority 9997: Rule Gate wraps `execute_callback`
- Priority 9998: License Gate wraps the already-rule-wrapped callback
- Priority 9999: Schema Patch injects `default: []` into object-type schemas

Runtime order: **license check → rate limit → write gate → rule check → per-object capability → input validation → original logic**. A Pro-group-gated ability on a Lite license (or on an unlicensed install) returns `plan_insufficient` or `license_required` before hitting any other gate.

### Infrastructure files

| File | Purpose |
|---|---|
| `includes/rules/class-rule-gate.php` | Reflection-based callback wrapper. Rate limit + write gate + rule handshake enforcement. |
| `includes/rules/class-rule-store.php` | `$wpdb` CRUD for `wp_maxi_ai_ability_rules`. |
| `includes/rules/class-rule-session.php` | Per-session acknowledgement cache via transients. HMAC-normalized session IDs. |
| `includes/rules/class-rule-schema.php` | Table creation via `dbDelta()`. |
| `includes/rules/class-rate-limiter.php` | Per-session sliding-window rate limiting (read/write/ai tiers). |
| `includes/rules/default-rules.php` | Shipped baseline rules array. |
| `includes/ai/class-key-encryption.php` | Sodium-based encryption at rest for API keys. |
| `includes/class-audit-log.php` | Append-only audit log with SHA-256 hash chaining. |
| `abilities/system/verify-audit-chain.php` | Ability to verify audit log hash chain integrity. |

### Surfacing Friction & Capturing Knowledge

PLAYBOOK-INIT defines the behavioral rules (when to offer, quality bar, "don't create autonomously"). This section documents the architectural rationale.

**Why it exists.** Agents encounter friction — clunky queries, misleading errors, missing abilities — but historically only surfaced problems when a tool call outright failed. Successful-but-inefficient workflows went unreported. The Surfacing Friction system closes that gap by giving agents a calibrated threshold for offering to log friction and knowledge.

**Two mechanisms, one pattern:**

1. **Friction notes** (`agent-note`, topic `bug` or `optimization`) — flag inefficiencies the operator can feed into plugin improvement. The agent offers; the operator decides whether to create.
2. **Knowledge notes** (`agent-knowledge`) — capture non-obvious solutions so future agents skip the discovery phase. The agent offers; the operator decides. Created at `review`, activated only by an admin (maker-checker).

**Calibration.** The playbook provides five "smell" heuristics (broader-than-needed queries, manual counting from verbose output, workarounds for blocked clean paths, repeated combinable calls, fragile manual interpretation). These are hints, not a checklist — the quality bar is "would you mention this to a colleague?" This prevents over-triggering while still catching the worked-but-clunky cases that pure error-based detection misses.

**Lifecycle.** Friction → agent-note → dev acknowledges → fix → verify → resolved. Knowledge → agent-knowledge at `review` → operator activates → future agents use it at bootstrap → friction self-extinguishes. The knowledge-notes live refresh ensures mid-session activations are immediately visible.

### Table schema

```
wp_maxi_ai_ability_rules
├── id              bigint unsigned, auto-increment, PK
├── ability_id      varchar(100), UNIQUE
├── title           varchar(255)
├── content         longtext (markdown body)
├── source          varchar(20) — "default" | "operator" | "docu"
├── version         int unsigned, default 1 (auto-increments on update)
├── status          varchar(20), default "active"
├── created_at      datetime
└── updated_at      datetime
```

---

## Ability Categories

| Slug        | Purpose                          |
|-------------|----------------------------------|
| system      | Internal system abilities.       |
| content     | Content and page management.     |
| taxonomy    | Taxonomy and term management.    |
| meta        | Metadata for posts, terms, users.|
| media       | Media and file handling.         |
| ai          | AI-powered generation and processing. |
| woocommerce | WooCommerce store management — products, orders, coupons, shipping, and taxes. |
| yoast       | Yoast SEO integration — term and post SEO fields. |
| development | Developer and system utilities.  |

---

## Extending Maxi AI

This section is for building **client-specific plugins** that add their own abilities or reuse Maxi AI's generation services. The goal is to keep `maxi-ai` unmodified across client engagements — all per-client logic lives in a separate plugin.

### Registering your own abilities

Abilities are registered via the WordPress Abilities API, not via anything Maxi-specific. A client plugin can register abilities exactly the same way `maxi-ai` does, with no dependency on Maxi AI's internals:

```php
add_action( 'wp_abilities_api_init', function () {
    wp_register_ability( 'acme/reconcile-inventory', [
        'label'       => 'Reconcile Inventory',
        'description' => 'Reconcile stock levels against the ERP feed.',
        'category'    => 'acme',
        'meta'        => [
            'show_in_rest' => true,
            'mcp'          => [ 'public' => true ], // exposes to MCP
        ],
        'input_schema'        => [ /* ... */ ],
        'execute_callback'    => function ( $input ) { /* ... */ },
        'permission_callback' => function () { return current_user_can( 'manage_woocommerce' ); },
    ] );
} );
```

The ability shows up in `mcp-adapter-discover-abilities`, is callable via `mcp-adapter-execute-ability`, and follows the same capability/auth model as native Maxi abilities. Only dependencies: `abilities-api` and `mcp-adapter` active. Maxi AI does not need to be installed unless the ability calls into its services (see next section).

**Use your own namespace.** `maxi/` is owned by this plugin. Pick a prefix for the client (`acme/`, `clientname/`, ...) and stay in it. The MCP adapter lists every registered ability with `meta.mcp.public = true` regardless of prefix.

**Do not drop files into `maxi-ai/abilities/`.** That directory is auto-loaded by glob and is internal to this plugin. Client abilities live in the client plugin's own directory structure.

### Reusing Maxi AI's generation services

Abilities are thin wrappers over a service layer that client plugins **can call directly**. This is the point of the split: generation logic, provider selection, retry handling, audit logging, and media-library sideloading all live below the ability layer and are reusable.

| Class | Use for |
|---|---|
| `Maxi_AI_Text_Generator::generate( array $params )` | Synchronous text generation. Respects configured default provider unless overridden. |
| `Maxi_AI_Image_Generator::generate( array $params )` | Image generation with automatic media-library sideload. |
| `Maxi_AI_Image_Generator::sideload_image( $url, $params )` | Standalone URL → media-library helper. |
| `Maxi_AI_Image_Editor` | Image editing / inpainting (same pattern). |
| `Maxi_AI_Vision_Analyzer` | Vision analysis (same pattern). |
| `Maxi_AI_Config::get( $key )`, `Maxi_AI_Config::flush()` | Read cached non-credential config. Do not read credentials this way — see `maxi/list-provider-keys`. |

Example — a client ability that generates a product description using Maxi AI's text layer:

```php
'execute_callback' => function ( $input ) {
    if ( ! class_exists( 'Maxi_AI_Text_Generator' ) ) {
        return new WP_Error( 'maxi_ai_missing', 'Maxi AI is required for this ability.' );
    }

    $result = Maxi_AI_Text_Generator::generate( [
        'prompt'     => $input['prompt'],
        'provider'   => 'anthropic', // or omit to use configured default
        'max_tokens' => 1000,
    ] );

    // business logic: persist, post-process, return
},
```

**Stability contract.** The classes listed in the table above are the **supported extension surface** for third-party code. Everything else under `includes/` — providers, batch workers, HTTP client, key audit, the schema patch — is internal and may change between releases without notice. If you find yourself reaching into `Maxi_AI_Provider_Factory`, `Maxi_AI_Client`, or the provider classes directly, that's a signal the thing you need should become a first-class service method instead — open an issue.

### What is not (yet) extensible

These are real gaps in the platform today. They exist as deliberate "wait for a concrete use case" decisions, not oversights:

- **Custom providers.** `Maxi_AI_Provider_Factory` hard-codes the six supported providers (OpenAI, Anthropic, OpenRouter, Replicate, BFL, local). A client plugin cannot register a new provider without editing core. For most "bring your own LLM" scenarios the `local` provider speaks any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, LocalAI, custom gateways); for access to closed-source upstream models (Claude, Gemini, etc.) without provisioning per-vendor accounts, OpenRouter is the aggregator path.
- **Hooks on the generation path.** There are no `before_generate` / `after_generate` / `generation_params` filters. A client plugin cannot inject prompt rewrites, response post-processing, or per-tenant routing into Maxi's services without wrapping them in its own layer.

Both will be added when a client engagement needs them — at that point the API shape designs itself against the real use case. If you hit either of these, open an issue describing the scenario rather than forking.

### Recommended structure for a client engagement

1. Activate `abilities-api`, `mcp-adapter`, `maxi-ai` — unmodified.
2. Build a client-specific plugin (`acme-operations` or similar) that:
   - Registers abilities for the client's unique processes in its own namespace.
   - Calls Maxi AI's service classes for any AI features it wants to reuse.
   - Lives in its own git repo, versioned independently of `maxi-ai`.
3. Never edit `maxi-ai` on the client site. Update-clean is the whole point.

---

## Agentic Development

This section is for AI agents assisting with **development of the plugin itself** — adding abilities, modifying existing ones, and maintaining code quality.

### Plugin Structure — What Goes Where

| Directory / File | Purpose | When to touch |
|---|---|---|
| `maxi-ai.php` | Plugin bootstrap. Loads everything. | Only if adding a new loader (e.g. new top-level directory). |
| `includes/` | Shared helper functions. | When adding utility functions used across multiple abilities. |
| `includes/ai.php` | AI infrastructure entry point. Loads all sub-files. | When changing AI loading order. |
| `includes/ai/` | AI provider abstraction, services, and batch system. | When adding providers, services, or modifying batch processing. |
| `bootstrap/` | One-time init hooks (MCP bridge). | Rarely. Only if changing how abilities are exposed to MCP. |
| `abilities/{category}/` | Individual ability files. **One ability per file.** | Most common change — this is where new features go. |
| `abilities/system/register-categories.php` | Ability category registry. | When adding a new category. |
| `abilities/_ability-template.php` | Copy-paste starter for new abilities. | Never modify — copy it instead. |
| `abilities/woocommerce/` | WooCommerce-specific abilities. | When adding abilities that require WooCommerce APIs, custom tables, or serialized meta (e.g. orders, coupons, variations, shipping). Generic product operations (CRUD, pricing, stock) are handled by content/meta/taxonomy abilities — only add here what the generic abilities **cannot** do cleanly. |
| `_trash/` | Legacy / deprecated code. | Ignore entirely. Never load or reference files here. |

### Adding a New Ability

1. **Copy the template:** Copy `abilities/_ability-template.php` to `abilities/{category}/{verb-noun}.php`.
2. **Choose an ID:** Use the pattern `maxi/{verb-noun}` (e.g. `maxi/create-order`, `maxi/delete-product`).
3. **Define `input_schema`:** This is **mandatory**. Without it, the MCP adapter cannot validate input and the ability will silently fail when called by an external agent. Use JSON Schema draft-7 format.
4. **Set `permission_callback`:** Use `current_user_can()` with the appropriate WordPress capability. Never use `__return_true`.
5. **Use `maxi_ai_response()`:** For every return path — success and failure. This ensures consistent response format and automatic error logging.
6. **Sanitize all input:** Use the appropriate WordPress sanitization function for each parameter type.
7. **No manual registration needed:** The file is auto-loaded by `Maxi_AI::load_abilities()` via `RecursiveDirectoryIterator`.

### Adding a New Category

Edit `abilities/system/register-categories.php` and add an entry to the `$categories` array:

```php
'new-category' => [
    'label'       => 'New Category',
    'description' => 'What this category covers.',
],
```

### Adding a Helper Function

Create a new file in `includes/` or add to `includes/helpers.php`. All files in `includes/` are auto-loaded via glob.

### Modifying an Existing Ability

- **Read the file first** before making changes.
- If adding new parameters: update `input_schema` > `properties` and update `required` if needed.
- If changing the description: update the `description` field — this is what agents see when discovering abilities.
- Always keep `permission_callback` appropriate to the action.

### Conventions

- **Naming:** Ability IDs use `maxi/{verb-noun}` kebab-case (e.g. `maxi/publish-page`, `maxi/upload-image`).
- **File naming:** Matches the noun part of the ability ID (e.g. `publish-page.php`, `upload-image.php`).
- **One ability per file.** No exceptions.
- **Response format:** Always return via `maxi_ai_response( bool $success, array $data, string|null $error )`.
- **Sanitization mapping:**

| Input type | Sanitization function |
|---|---|
| Plain text / titles | `sanitize_text_field()` |
| HTML content | `wp_kses_post()` |
| URLs | `esc_url_raw()` |
| Slugs / status / enums | `sanitize_key()` |
| Meta keys | `sanitize_text_field()` (preserves case — meta keys are case-sensitive) |
| Integer IDs | `intval()` |
| Email addresses | `sanitize_email()` |

- **Capability mapping:** <a id="capability-mapping"></a>

| Action | Capability |
|---|---|
| Read non-sensitive data | `read` |
| Create/edit posts and CPTs | `edit_posts` |
| Publish posts | `publish_posts` |
| Create/publish pages | `publish_pages` |
| Edit existing pages | `edit_pages` |
| Edit other users' posts | `edit_others_posts` |
| Delete posts | `delete_posts` |
| Upload files | `upload_files` |
| Manage taxonomies | `manage_categories` |
| Manage WooCommerce products | `edit_products` |
| Admin-level operations | `manage_options` |

### Auto-Loading Behavior

The plugin uses `RecursiveDirectoryIterator` on the `abilities/` directory. This means:

- Any `.php` file placed anywhere inside `abilities/` (including subdirectories) is automatically loaded.
- Files prefixed with `_` (like `_ability-template.php`) **are loaded too** — they should not register abilities or produce side effects.
- Non-PHP files (like this README) are ignored.

### Updating Documentation

When abilities are added, modified, or removed:

- Update the ability tables in `PLAYBOOK-DOC.md` and `PLAYBOOK-INIT.md` as needed.
- Update the published documentation on the Docu site (page ID 60, "Maxi AI Core v3") to match.

### Dependencies

The plugin depends on two external packages that must be active:

- **[WordPress MCP Adapter](https://github.com/WordPress/mcp-adapter)** — Bridges abilities to the MCP protocol. Without it, abilities work internally but are invisible to external agents.
- **[WordPress Abilities API](https://github.com/WordPress/abilities-api)** — Provides `wp_register_ability()`, `wp_get_abilities()`, and the execution layer. Without it, nothing registers.

Both are checked with `function_exists()` guards — the plugin degrades gracefully if either is missing.
