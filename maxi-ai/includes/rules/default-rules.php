<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Baseline ability rules, shipped with the plugin.
 *
 * Seeded into wp_maxi_ai_ability_rules on plugin activation and on DB-version
 * bumps. One entry per shipped ability that has a meaningful workflow or
 * anti-pattern worth pinning down.
 *
 * Shape:
 *   return [
 *       'maxi/<ability-id>' => [
 *           'title'         => string,
 *           'content'       => string (markdown),
 *           'delivery_mode' => 'reject_first' | 'inline_on_success',
 *       ],
 *       ...
 *   ];
 *
 * Rules for abilities NOT listed here can be authored by the operator via
 * maxi/manage-ability-rules. The baseline is intentionally lean — only the
 * abilities where the cost of a wrong call is high are pinned here.
 *
 * ─── delivery_mode classification rubric ──────────────────────────────
 *
 * Every rule MUST be tagged with an explicit delivery_mode. No implicit
 * fallback — readers of this file should see the author's intent at a
 * glance. The safe default (and the DB-level default when a tag is
 * missing) is reject_first.
 *
 * Mental model:
 *   - reject_first      = blocking rule (guidance must shape the call)
 *   - inline_on_success = descriptive rule (documents what PHP enforces)
 *
 * A rule stays reject_first if ANY of these disqualifiers apply:
 *
 *   - Sequencing requirement. Agent must call X before Y, and X is not
 *     PHP-enforced automatically on every call to Y.
 *   - Data-sensitivity constraint. Rule names fields, keys, or payloads
 *     that require care (PII, credentials, audit-relevant state).
 *   - Store-specific caveat. Rule depends on WooCommerce / taxonomy /
 *     media state that varies per site — agent needs context BEFORE
 *     it plans the call.
 *   - Input-shaping anti-pattern. Rule changes how the input should be
 *     formed (e.g. "send only fields you intend to change",
 *     destructive-replace warnings, type-coercion warnings).
 *   - Billing, irreversibility, or destructive default. Rule warns that
 *     a wrong call costs money, deletes data, or locks in state PHP
 *     guards don't catch.
 *   - Operator-confirmation requirement. Rule requires explicit human
 *     sign-off before action.
 *   - Anything that should affect execution planning. If the rule
 *     changes HOW the agent would approach the call — not just document
 *     what the PHP guard already enforces — it is blocking.
 *
 * If none of the above apply and the rule is purely "good to know"
 * guidance that PHP guards or the ability's own behaviour already
 * enforce, it qualifies for inline_on_success.
 *
 * When in doubt, pick reject_first. The cost of a wrong descriptive call
 * is low; the cost of a wrong prescriptive call can be destructive.
 *
 * @package Maxi_AI
 */

return [

    // ─── Content: Read ────────────────────────────────────────────────

    'maxi/get-content' => [
        'title'   => 'Rules for maxi/get-content',
        'content' => <<<'MD'
# Rules for `maxi/get-content`

Read-only. Returns a single post, page, or CPT entry by ID.

## Session side-effect

Calling this ability marks the post as "read" for the current MCP session. This satisfies the read-before-write gate on `maxi/update-content` — you can then send a `content` field update for this post without being blocked.

If you only need metadata (title, status, slug) and do NOT plan to update `content`, you can skip this call and go straight to `maxi/update-content` with only the metadata fields.

## When to use

- Before updating a post's body content (required by PHP gate).
- When you need the full `content` field to inspect or modify it.
- When you need a post's current field values before deciding what to change.

## Anti-patterns

- Calling get-content for every post in a list when you only need titles — use `maxi/list-content` instead.
- Ignoring the returned content and regenerating from scratch — read it, then surgically edit.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/get-content-by-slug' => [
        'title'   => 'Rules for maxi/get-content-by-slug',
        'content' => <<<'MD'
# Rules for `maxi/get-content-by-slug`

Read-only. Returns a single post, page, or CPT entry by its URL slug.

## Session side-effect

Like `maxi/get-content`, this marks the returned post as "read" for the current MCP session, satisfying the read-before-write gate on `maxi/update-content`.

## When to use

- When you know the slug but not the post ID (e.g. the operator says "update the about page").
- Defaults to `post_type: "page"` — pass `post_type` explicitly for posts or custom types.

## Anti-patterns

- Guessing slugs — if you're not sure of the slug, use `maxi/search-content` or `maxi/list-content` first.
- Calling this then calling `maxi/get-content` for the same post — redundant, one read is enough.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/list-content' => [
        'title'   => 'Rules for maxi/list-content',
        'content' => <<<'MD'
# Rules for `maxi/list-content`

Read-only. Lists posts, pages, or CPT entries with filters.

## Best practices

- Use the narrowest filters possible: `post_type`, `status`, `author`, `parent`. Unfiltered queries on large sites return too much data and waste tokens.
- Default limit is 20. Increase only when you need more results.
- Returns titles, IDs, statuses, slugs, dates, and permalinks — does NOT include full `content` bodies. Use `maxi/get-content` to read individual post bodies.

## When to use

- To discover what content exists before acting on it.
- To find post IDs for subsequent get/update/delete calls.
- To enumerate children of a parent page.

## Anti-patterns

- Listing all posts then filtering in your own logic — use the ability's built-in filters.
- Requesting content bodies via list — this ability returns metadata only. Read individual posts with `maxi/get-content`.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/search-content' => [
        'title'   => 'Rules for maxi/search-content',
        'content' => <<<'MD'
# Rules for `maxi/search-content`

Read-only. Searches posts, pages, or CPT entries by keyword, taxonomy, meta, author, or date range. Searches all post types by default, including non-public ones.

## Best practices

- Combine `search` with `post_type` when you know the type — narrows results and improves relevance.
- Use taxonomy and meta filters for structured queries (e.g. "all products in category X with meta key Y").
- Date range filters (`after`, `before`) are useful for time-scoped searches.

## When to use

- When you need to find content by keyword and don't know the exact slug or ID.
- For cross-type searches (e.g. "find everything mentioning 'shipping policy'").
- For structured queries combining taxonomy + meta + date filters.

## Anti-patterns

- Using search when you already know the slug — use `maxi/get-content-by-slug` instead.
- Using search when you already know the ID — use `maxi/get-content` instead.
- Searching with very broad terms on large sites — be specific.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    // ─── Content: Write ───────────────────────────────────────────────

    'maxi/create-content' => [
        'title'   => 'Rules for maxi/create-content',
        'content' => <<<'MD'
# Rules for `maxi/create-content`

Creates a new post, page, or custom post type entry.

## Write authorization

**PHP-enforced.** Only administrators can call this via MCP. Non-admin agents receive a `write_not_authorized` error. No text-based rule can override this gate.

## Required fields

- `post_type` — must be a registered post type (e.g. `page`, `post`, `product`).
- `title` — the post title.

All other fields are optional. Default status is `draft`.

## Content must be valid Gutenberg block markup

**PHP-enforced.** If you send a `content` field, it must contain at least one `<!-- wp:` block comment. Raw HTML without block wrappers is rejected with `invalid_block_markup`.

Reference format:

```html
<!-- wp:paragraph -->
<p>Text here.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2>Section Title</h2>
<!-- /wp:heading -->
```

## Input validation (PHP-enforced)

- **Status:** must be one of `draft`, `publish`, `pending`, `private`, `future`. Other values are rejected.
- **Author:** if provided, the user ID must exist. Invalid IDs return `Author not found`.
- **Parent:** if provided and > 0, the parent post must exist. Invalid IDs return `Parent post not found`.
- **Date:** if provided, must be `Y-m-d H:i:s` format exactly. Invalid format is rejected.
- **Future status + date:** setting `status: "future"` requires a `date` field with a future timestamp.

## Audit trail

Every successful creation is logged to the audit trail under category `content`, event `content_created`.

## Anti-patterns

- Creating content without a clear purpose — drafts accumulate and clutter the site.
- Sending raw HTML without Gutenberg block wrappers.
- Setting `status: "publish"` for content that hasn't been reviewed — prefer `draft` and let the operator publish.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/update-content' => [
        'title'   => 'Rules for maxi/update-content',
        'content' => <<<'MD'
# Rules for `maxi/update-content`

Read this before calling `maxi/update-content` for anything beyond a trivial metadata-only edit. These rules describe the workflow and the common failure modes.

## Purpose

Update an existing post, page, or custom post type entry. Partial update — you send only the fields that should change.

## Write authorization

This ability is PHP-enforced: only administrators can call it via MCP. Non-admin agents receive a `write_not_authorized` error. No text-based rule can override this gate.

## Core workflow: read first, then update (when touching `content`)

**PHP-enforced.** If you send a `content` field without calling `maxi/get-content` or `maxi/get-content-by-slug` for that post first, the server returns a `content_not_read` error. No override exists.

For any edit that touches `content` (body HTML), you **must** read the post first:

1. Call `maxi/get-content` with the `post_id`.
2. Inspect the returned `content` string.
3. Construct the new full content by modifying the existing content — append, prepend, or surgically edit. Do not regenerate from scratch.
4. Call `maxi/update-content` with `post_id` + the changed fields only.

For edits that do NOT touch `content` (title, excerpt, status, slug, parent, author, date), you do not need to read first. Go straight to step 4 with only the changed fields.

## Send only the fields you intend to change

`update-content` accepts `post_id` plus any of: `title`, `content`, `excerpt`, `status`, `slug`, `parent`, `author`, `date`. The rule is: **send only the fields that should change**.

Examples of correct partial updates:

```json
// Title-only update
{ "post_id": 60, "title": "New title" }

// Excerpt-only update
{ "post_id": 60, "excerpt": "Short summary." }

// Status transition
{ "post_id": 60, "status": "publish" }
```

Do not include `content` in the payload unless `content` is actually changing.

## Content must be valid Gutenberg block markup

**PHP-enforced.** Content without `<!-- wp:` block markers is rejected with `invalid_block_markup`.

Reference examples:

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
```

## Input validation (PHP-enforced)

- **Status:** must be one of `draft`, `publish`, `pending`, `private`, `future`. Other values are rejected.
- **Author:** if provided, the user ID must exist. Invalid IDs return `Author not found`.
- **Parent:** if provided and > 0, the parent post must exist. Invalid IDs return `Parent post not found`.
- **Date:** if provided, must be `Y-m-d H:i:s` format exactly. Invalid format is rejected.
- **Future status + date:** setting `status: "future"` requires a `date` field with a future timestamp.

## Audit trail

Every successful update is logged under category `content`, event `content_updated`, with the list of changed fields.

## On error

If `update-content` returns `success: false`, **read the error message before retrying**. Fix the input first. Never retry the identical call.

## Anti-patterns (do not do this)

- Sending every field when only `title` is changing.
- Writing raw `<p>text</p>` without the `<!-- wp:paragraph -->` comment wrappers.
- Regenerating `content` from scratch when the task was "add one paragraph".
- Retrying the same failed call hoping for a different outcome.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/delete-content' => [
        'title'   => 'Rules for maxi/delete-content',
        'content' => <<<'MD'
# Rules for `maxi/delete-content`

Deletes or trashes a post, page, or custom post type entry.

## Write authorization

**PHP-enforced.** Only administrators can call this via MCP. Non-admin agents receive a `write_not_authorized` error.

## Per-post capability check

**PHP-enforced.** The server checks `current_user_can('delete_post', $post_id)` — not just the generic `delete_posts` capability. This ensures the user has permission to delete this specific post.

## Trash vs permanent delete

- Default behavior (no `force` parameter or `force: false`): moves the post to trash. This is reversible.
- `force: true`: permanently deletes the post and all its metadata. This is **irreversible**.

**Prefer trash over permanent delete.** Only use `force: true` when explicitly instructed by the operator.

## Audit trail

Every successful deletion is logged to the audit trail under category `content`, event `content_deleted`, including whether it was a permanent delete or trash.

## Anti-patterns

- Using `force: true` without explicit operator instruction.
- Deleting content without confirming the target — always verify the post ID and title match expectations.
- Bulk-deleting without listing first — use `maxi/list-content` to confirm what you're about to delete.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/duplicate-content' => [
        'title'   => 'Rules for maxi/duplicate-content',
        'content' => <<<'MD'
# Rules for `maxi/duplicate-content`

Duplicates an existing post, page, or CPT entry as a draft. Copies content, excerpt, meta, and taxonomy terms.

## Write authorization

**PHP-enforced.** Only administrators can call this via MCP. Non-admin agents receive a `write_not_authorized` error.

## Per-post capability check

**PHP-enforced.** The server checks `current_user_can('edit_post', $post_id)` on the source post.

## Input validation (PHP-enforced)

- **Status:** must be one of `draft`, `publish`, `pending`, `private`. Default is `draft`.

## Behavior

- The duplicate's author is set to the current user, not the original post's author.
- Title defaults to the original title with " (Copy)" appended. Override with the `title` parameter.
- All post meta is copied (except `_edit_*` keys).
- All taxonomy terms are copied.

## Audit trail

Every successful duplication is logged under category `content`, event `content_duplicated`, with the source post ID in context.

## Anti-patterns

- Duplicating then publishing immediately — review the duplicate first, it may contain stale content.
- Duplicating as a way to "back up" content — WordPress revisions serve that purpose.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── Content: Mutations ───────────────────────────────────────────

    'maxi/change-status' => [
        'title'   => 'Rules for maxi/change-status',
        'content' => <<<'MD'
# Rules for `maxi/change-status`

Changes the status of a post, page, or custom post type entry.

## Write authorization

**PHP-enforced.** Only administrators can call this via MCP. Non-admin agents receive a `write_not_authorized` error.

## Per-post capability check

**PHP-enforced.** The server checks `current_user_can('edit_post', $post_id)`.

## Input validation (PHP-enforced)

- **Status:** must be one of `publish`, `draft`, `pending`, `private`, `trash`. Other values are rejected.

## Common transitions

- `draft` → `publish`: makes content live on the site.
- `publish` → `draft`: takes content offline (URL returns 404).
- `publish` → `trash`: soft-deletes content (recoverable from trash).
- `trash` → `draft`: restores trashed content as a draft.

## Audit trail

Every successful status change is logged under category `content`, event `status_changed`, with old and new status in context.

## Anti-patterns

- Publishing without operator approval — prefer leaving content as `draft` or `pending` unless explicitly instructed to publish.
- Using change-status to set `future` — use `maxi/schedule-content` instead, which validates the date.
- Trashing content as a substitute for permanent delete — if the operator wants it gone, they'll say so.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/schedule-content' => [
        'title'   => 'Rules for maxi/schedule-content',
        'content' => <<<'MD'
# Rules for `maxi/schedule-content`

Schedules a post, page, or CPT entry for future publication.

## Write authorization

**PHP-enforced.** Only administrators can call this via MCP. Non-admin agents receive a `write_not_authorized` error.

## Per-post capability check

**PHP-enforced.** The server checks `current_user_can('edit_post', $post_id)`.

## Input validation (PHP-enforced)

- **Date format:** must be `Y-m-d H:i:s` exactly. Invalid format is rejected.
- **Future date:** the date must be in the future. Past dates are rejected with "Date must be in the future."
- Both `post_id` and `date` are required fields.

## Behavior

Sets the post's status to `future` and its publish date to the specified time. WordPress will automatically publish the post when the scheduled time arrives (via WP-Cron).

## Audit trail

Every successful scheduling is logged under category `content`, event `content_scheduled`, with the scheduled date in context.

## Anti-patterns

- Scheduling without confirming the timezone — dates are in the site's configured timezone, not UTC.
- Scheduling content that hasn't been reviewed — the post goes live automatically at the scheduled time.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/set-author' => [
        'title'   => 'Rules for maxi/set-author',
        'content' => <<<'MD'
# Rules for `maxi/set-author`

Changes the author of a post, page, or custom post type entry.

## Write authorization

**PHP-enforced.** Only administrators can call this via MCP. Non-admin agents receive a `write_not_authorized` error.

## Per-post capability check

**PHP-enforced.** The server checks `current_user_can('edit_post', $post_id)`.

## Input validation (PHP-enforced)

- **Author ID:** the target user must exist. Invalid user IDs return `User not found`.

## Audit trail

Every successful author change is logged under category `content`, event `author_changed`, with old and new author IDs in context.

## Anti-patterns

- Changing the author without operator instruction — author attribution has editorial and legal implications.
- Guessing user IDs — use `maxi/get-current-user` or WP-CLI `user list` to find the correct ID.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/set-parent' => [
        'title'   => 'Rules for maxi/set-parent',
        'content' => <<<'MD'
# Rules for `maxi/set-parent`

Sets or removes the parent of a hierarchical post (pages, hierarchical CPTs).

## Write authorization

**PHP-enforced.** Only administrators can call this via MCP. Non-admin agents receive a `write_not_authorized` error.

## Per-post capability check

**PHP-enforced.** The server checks `current_user_can('edit_post', $post_id)`.

## Input validation (PHP-enforced)

- **Hierarchical type:** the post's type must be hierarchical (e.g. `page`). Non-hierarchical types (e.g. `post`) are rejected.
- **Parent existence:** if `parent_id` > 0, the parent post must exist. Invalid IDs return `Parent post not found`.
- **Remove parent:** set `parent_id: 0` to make the post top-level.

## Audit trail

Every successful parent change is logged under category `content`, event `parent_changed`, with old and new parent IDs in context.

## Anti-patterns

- Creating circular hierarchies — don't set a page's parent to one of its own children.
- Setting parent on non-hierarchical post types — will be rejected.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── Taxonomy: Read ───────────────────────────────────────────────

    'maxi/get-term' => [
        'title'   => 'Rules for maxi/get-term',
        'content' => <<<'MD'
# Rules for `maxi/get-term`

Read-only. Retrieves a single term by ID and taxonomy.

## When to use

- When you need the full details of a specific term (name, slug, description, parent, count).
- Before updating a term, to verify its current state.

## Anti-patterns

- Calling get-term in a loop for every term — use `maxi/list-terms` with filters instead.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/list-terms' => [
        'title'   => 'Rules for maxi/list-terms',
        'content' => <<<'MD'
# Rules for `maxi/list-terms`

Read-only. Lists terms in a taxonomy with optional filters.

## Best practices

- Always provide the `taxonomy` parameter — it's required.
- Use `hide_empty: true` when you only care about terms that have posts assigned.
- Use `parent: 0` to get only top-level terms in hierarchical taxonomies.
- Default limit is 100, max 500. Use `search` to narrow results on large taxonomies.

## When to use

- To discover available categories, tags, or custom taxonomy terms.
- To find term IDs for subsequent assign/set/remove calls.
- To enumerate the hierarchy of a taxonomy (filter by `parent`).

## Anti-patterns

- Listing all terms when you need one specific term — use `maxi/get-term` instead.
- Listing without filters on taxonomies with thousands of terms.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    // ─── Taxonomy: Write ──────────────────────────────────────────────

    'maxi/create-term' => [
        'title'   => 'Rules for maxi/create-term',
        'content' => <<<'MD'
# Rules for `maxi/create-term`

Creates a new term in any taxonomy (category, tag, custom).

## Required fields

- `taxonomy` — must be a registered taxonomy.
- `name` — the term name.

## Input validation (PHP-enforced)

- **Taxonomy existence:** the taxonomy must be registered. Invalid taxonomies are rejected.
- **Parent existence:** if `parent` is provided and > 0, the parent term must exist in the same taxonomy. Invalid parent IDs return `Parent term not found`.
- **Duplicate detection:** `wp_insert_term` returns an error if a term with the same name and slug already exists in the taxonomy. Read the error — don't retry blindly.

## Audit trail

Every successful creation is logged under category `taxonomy`, event `term_created`.

## Anti-patterns

- Creating duplicate terms — check `maxi/list-terms` first to see if the term already exists.
- Creating terms in the wrong taxonomy — verify the taxonomy name matches the intended one (e.g. `product_cat` not `category` for WooCommerce).
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/update-term' => [
        'title'   => 'Rules for maxi/update-term',
        'content' => <<<'MD'
# Rules for `maxi/update-term`

Updates an existing term. Send only the fields to change.

## Required fields

- `term_id` — the term to update.
- `taxonomy` — the taxonomy the term belongs to.

## Input validation (PHP-enforced)

- **Taxonomy existence:** the taxonomy must be registered.
- **Parent existence:** if `parent` is provided and > 0, the parent term must exist in the same taxonomy. Invalid parent IDs return `Parent term not found`.
- **Empty update rejection:** if no fields are provided to change, returns "No fields to update."

## Audit trail

Every successful update is logged under category `taxonomy`, event `term_updated`, with the list of changed fields.

## Anti-patterns

- Sending all fields when only the name is changing — partial updates only.
- Creating circular parent hierarchies — don't set a term's parent to itself or one of its children.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/delete-term' => [
        'title'   => 'Rules for maxi/delete-term',
        'content' => <<<'MD'
# Rules for `maxi/delete-term`

Permanently deletes a term from a taxonomy. This is **irreversible** — there is no trash for terms.

## Required fields

- `term_id` — the term to delete.
- `taxonomy` — the taxonomy.

## Behavior

- Posts that had the deleted term assigned will lose that assignment.
- Child terms of the deleted term become top-level (their parent is set to 0).
- Default categories/terms cannot be deleted — WordPress will return an error.

## Audit trail

Every successful deletion is logged under category `taxonomy`, event `term_deleted`.

## Anti-patterns

- Deleting terms without understanding the impact — check `count` (number of posts using the term) via `maxi/list-terms` first.
- Deleting terms without operator instruction — term deletion affects site navigation, URLs, and SEO.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── Taxonomy: Post-Term Assignment ───────────────────────────────

    'maxi/assign-terms' => [
        'title'   => 'Rules for maxi/assign-terms',
        'content' => <<<'MD'
# Rules for `maxi/assign-terms`

Appends terms to a post without removing existing terms. This is additive — existing term assignments are preserved.

## Per-post capability check

**PHP-enforced.** The server checks `current_user_can('edit_post', $post_id)`.

## Required fields

- `post_id` — the post to assign terms to.
- `taxonomy` — the taxonomy.
- `terms` — array of term IDs (integers) or slugs (strings).

## When to use

- When you want to ADD terms to a post without removing its existing terms.
- Preferred over `maxi/set-terms` when you don't want to accidentally remove existing assignments.

## Audit trail

Every successful assignment is logged under category `taxonomy`, event `terms_assigned`.

## Anti-patterns

- Using assign-terms when you mean to REPLACE all terms — use `maxi/set-terms` instead.
- Assigning terms by name instead of ID or slug — use `maxi/list-terms` to find the correct identifiers first.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/remove-terms' => [
        'title'   => 'Rules for maxi/remove-terms',
        'content' => <<<'MD'
# Rules for `maxi/remove-terms`

Removes specific terms from a post without affecting other term assignments.

## Per-post capability check

**PHP-enforced.** The server checks `current_user_can('edit_post', $post_id)`.

## Required fields

- `post_id` — the post to remove terms from.
- `taxonomy` — the taxonomy.
- `terms` — array of term IDs (integers) to remove.

## When to use

- When you need to remove specific terms while preserving others.
- Preferred over `maxi/set-terms` when you only need to remove a few terms.

## Audit trail

Every successful removal is logged under category `taxonomy`, event `terms_removed`.

## Anti-patterns

- Using remove-terms to clear ALL terms — use `maxi/set-terms` with an empty array instead.
- Removing terms without checking what's currently assigned — use `maxi/get-term` or list the post's terms first.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/set-terms' => [
        'title'   => 'Rules for maxi/set-terms',
        'content' => <<<'MD'
# Rules for `maxi/set-terms`

Replaces ALL terms on a post for a given taxonomy. **Destructive** — existing terms for that taxonomy are removed first, then the new set is applied.

## Per-post capability check

**PHP-enforced.** The server checks `current_user_can('edit_post', $post_id)`.

## Required fields

- `post_id` — the post.
- `taxonomy` — the taxonomy.
- `terms` — array of term IDs (integers) or slugs (strings). Pass an empty array to clear all terms for this taxonomy.

## When to use

- When you need to set the EXACT set of terms for a taxonomy — replacing whatever was there.
- When the operator gives you a complete list of terms that should be assigned.

## Caution

This ability **removes all existing terms** in the specified taxonomy before assigning the new ones. If you pass `terms: [5]` and the post had terms `[5, 10, 15]`, the result is `[5]` — terms 10 and 15 are gone.

If you only need to add terms, use `maxi/assign-terms`. If you only need to remove specific terms, use `maxi/remove-terms`.

## Audit trail

Every successful set operation is logged under category `taxonomy`, event `terms_set`.

## Anti-patterns

- Using set-terms when you only want to add one term — use `maxi/assign-terms` instead.
- Passing an empty array accidentally — this clears all terms for the taxonomy on that post.
- Not reading the current terms first — you might unintentionally remove important assignments.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── Meta: Read ───────────────────────────────────────────────────

    'maxi/get-meta' => [
        'title'   => 'Rules for maxi/get-meta',
        'content' => <<<'MD'
# Rules for `maxi/get-meta`

Read-only. Retrieves a single meta value (or all meta) for a post, term, or user.

## PHP-enforced checks

- **Object-level permissions:** post reads require `read_post` (handles private/draft visibility); user meta reads require `list_users` (admin-only — prevents subscriber PII access); term meta reads are open (terms are public taxonomy objects).

## When to use

- When you need a specific meta value by key (e.g. `_thumbnail_id`, `total_sales`).
- Omit `meta_key` to retrieve all meta for the object — useful for discovery.

## Best practices

- Use `maxi/list-meta` with `exclude_hidden: true` for a cleaner overview (hides underscore-prefixed internal keys).
- For WooCommerce product analytics, check `total_sales` meta on the product post.

## Anti-patterns

- Reading user meta for sensitive fields (`user_pass`, `session_tokens`) — the GDPR masking layer will redact these, but avoid requesting them in the first place.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/list-meta' => [
        'title'   => 'Rules for maxi/list-meta',
        'content' => <<<'MD'
# Rules for `maxi/list-meta`

Read-only. Lists all meta keys and values for a post, term, or user.

## PHP-enforced checks

- **Object-level permissions:** same as `maxi/get-meta` — post reads require `read_post`, user meta reads require `list_users` (admin-only), term meta reads are open.

## Best practices

- Use `exclude_hidden: true` to hide keys starting with underscore (`_edit_lock`, `_wp_page_template`, etc.) — these are WordPress internals and rarely useful to agents.
- Use this for discovery — to see what meta keys exist on an object before reading/writing specific ones.

## Anti-patterns

- Listing user meta without `exclude_hidden: true` — exposes internal WordPress keys that clutter the response.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    // ─── Meta: Write ──────────────────────────────────────────────────

    'maxi/set-meta' => [
        'title'   => 'Rules for maxi/set-meta',
        'content' => <<<'MD'
# Rules for `maxi/set-meta`

Sets (adds or updates) a single meta value on a post, term, or user.

## Per-object capability check

**PHP-enforced.** For posts, the server checks `current_user_can('edit_post', $object_id)`. For users, checks `current_user_can('edit_user', $object_id)`. The target object must exist.

## Input validation (PHP-enforced)

- **Object type:** must be `post`, `term`, or `user`. Other values are rejected.
- **Object existence:** the target post/term/user must exist.

## Meta values

Always pass **plain/unserialized values**. WordPress handles serialization automatically. Never pre-serialize values (e.g. pass `test-class` not `a:1:{i:0;s:10:"test-class";}`), as this causes double serialization and corrupted data.

## Audit trail

Every successful set is logged under category `meta`, event `meta_set`.

## Anti-patterns

- Pre-serializing values — WordPress will double-serialize them.
- Setting meta on objects you haven't verified exist — the check is now PHP-enforced, but plan your workflow accordingly.
- Using set-meta in a loop for multiple keys — use `maxi/bulk-update-meta` instead.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/delete-meta' => [
        'title'   => 'Rules for maxi/delete-meta',
        'content' => <<<'MD'
# Rules for `maxi/delete-meta`

Deletes a meta key from a post, term, or user. This removes ALL values for that key on the object.

## Per-object capability check

**PHP-enforced.** For posts, the server checks `current_user_can('edit_post', $object_id)`. For users, checks `current_user_can('edit_user', $object_id)`. The target object must exist.

## Input validation (PHP-enforced)

- **Object type:** must be `post`, `term`, or `user`. Other values are rejected.
- **Object existence:** the target post/term/user must exist.

## Audit trail

Every successful deletion is logged under category `meta`, event `meta_deleted`.

## Anti-patterns

- Deleting internal WordPress meta keys (e.g. `_wp_page_template`, `_edit_lock`) — these are managed by WordPress core and deleting them can break functionality.
- Deleting meta without operator instruction — meta deletion is irreversible.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/bulk-update-meta' => [
        'title'   => 'Rules for maxi/bulk-update-meta',
        'content' => <<<'MD'
# Rules for `maxi/bulk-update-meta`

**[PRO]** Sets multiple meta key-value pairs on a post, term, or user in one call.

## Per-object capability check

**PHP-enforced.** For posts, the server checks `current_user_can('edit_post', $object_id)`. For users, checks `current_user_can('edit_user', $object_id)`. The target object must exist.

## Input validation (PHP-enforced)

- **Object type:** must be `post`, `term`, or `user`. Other values are rejected.
- **Object existence:** the target post/term/user must exist.
- **Empty meta rejection:** if no key-value pairs are provided, returns an error.

## Meta values

Same as `maxi/set-meta`: pass plain/unserialized values. WordPress handles serialization.

## Partial failure

The response includes `updated` (keys that succeeded) and `failed` (keys that failed). If ALL keys fail, the response is `success: false`. If some succeed and some fail, the response is `success: true` with both lists — check the `failed` array.

## Audit trail

Every successful bulk update is logged under category `meta`, event `meta_bulk_updated`, with the lists of updated and failed keys.

## When to use

- When you need to set 2+ meta keys on the same object — more efficient than calling `maxi/set-meta` repeatedly.
- For menu items, prefer WP-CLI `menu item update` with flags (`--classes=`, `--target=`) over setting meta directly.

## Anti-patterns

- Using this for a single key — use `maxi/set-meta` instead.
- Pre-serializing values.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── Media ──────────────────────────────────────────────────────────

    'maxi/get-attachment' => [
        'title'   => 'Get Attachment',
        'content' => <<<'MD'
# maxi/get-attachment

Read-only. Retrieve full details of a media attachment by ID, including metadata, image sizes, alt text, and file information.

## PHP-enforced checks

- **Object existence:** attachment must exist and be of type `attachment`.
- **Capability:** `read` (any authenticated user).

## Workflow

1. Call with `attachment_id`.
2. Returns: title, caption, description, alt_text, mime_type, url, parent_id, date, dimensions, file path, and all registered image sizes with URLs.

## When to use

- Before setting a featured image — verify the attachment exists and is the right file.
- To get image URLs at specific sizes for content insertion.
- To check attachment metadata (dimensions, MIME type) before operations.

## Anti-patterns

- Fetching attachments in a loop when `maxi/list-attachments` would be more efficient.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/list-attachments' => [
        'title'   => 'List Attachments',
        'content' => <<<'MD'
# maxi/list-attachments

Read-only. List media attachments with optional filters for MIME type, parent post, and search.

## PHP-enforced checks

- **Capability:** `read` (any authenticated user).
- **Pagination limits:** `per_page` capped at 100.

## Workflow

1. Call with optional filters: `mime_type`, `parent_id`, `search`, `per_page`, `page`, `orderby`, `order`.
2. Returns paginated list with total count and page info.

## Filters

- `mime_type`: Filter by type (e.g. `"image"`, `"image/jpeg"`, `"application/pdf"`).
- `parent_id`: Filter by parent post. Use `0` for unattached media.
- `search`: Search by title or filename.
- `orderby`: `date` (default), `title`, or `ID`.

## When to use

- To find existing media before uploading duplicates.
- To audit unattached media (`parent_id: 0`).
- To find images of a specific type for content.

## Anti-patterns

- Requesting all attachments without filters on a large media library.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/upload-attachment' => [
        'title'   => 'Upload Attachment',
        'content' => <<<'MD'
# maxi/upload-attachment

Upload any file to the WordPress media library from a URL or base64-encoded payload.

## PHP-enforced checks

- **Capability:** `upload_files`.
- **Input validation:** exactly one source required (`url` or `content_base64`, not both). `filename` required with base64.
- **File type validation:** WordPress allowed file types only (`wp_check_filetype`).

## Workflow

1. Provide either `url` (remote file) or `filename` + `content_base64` (inline payload).
2. Optionally set `title`, `alt_text`, `caption`, `parent_id`.
3. Returns `attachment_id`, `url`, and `type` (MIME).

## Upload sources

- **URL:** file is downloaded via `download_url()` and sideloaded. URL must be accessible.
- **Base64:** decoded, written to temp file, sideloaded. Extension must be WordPress-allowed.

## Audit trail

Every successful upload is logged under category `media`, event `attachment_uploaded`, with MIME type, source method, and parent ID.

## Anti-patterns

- Providing both `url` and `content_base64` — pick one.
- Uploading images via this ability — use `maxi/upload-image` for image-specific workflows.
- Uploading without setting alt text on images — always provide `alt_text` for accessibility.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/upload-image' => [
        'title'   => 'Upload Image',
        'content' => <<<'MD'
# maxi/upload-image

Upload an image to the media library. Simpler than `upload-attachment` — images only, no metadata fields.

## PHP-enforced checks

- **Capability:** `upload_files`.
- **Input validation:** exactly one source required (`url` or `content_base64`, not both). `filename` required with base64.
- **Image type enforcement:** base64 uploads must have an image MIME type (`image/*`).

## Workflow

1. Provide either `url` or `filename` + `content_base64`.
2. Returns `attachment_id` and `url`.

## Audit trail

Every successful upload is logged under category `media`, event `image_uploaded`, with MIME type and source method.

## When to use

- Quick image uploads where you don't need to set title/alt/caption inline.
- For full metadata control, use `maxi/upload-attachment` instead.

## Anti-patterns

- Uploading non-image files — use `maxi/upload-attachment` for PDFs, documents, etc.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/delete-attachment' => [
        'title'   => 'Delete Attachment',
        'content' => <<<'MD'
# maxi/delete-attachment

Permanently delete a media attachment and all its associated files (original + all generated sizes). This is irreversible.

## PHP-enforced checks

- **Object existence:** attachment must exist and be of type `attachment`.
- **Per-object capability:** `delete_post` checked against the specific attachment ID. An editor cannot delete another user's private attachments.
- **Capability:** `delete_posts` (permission_callback).

## Workflow

1. Verify the attachment exists and is the right one (use `maxi/get-attachment` first).
2. Call with `attachment_id`.
3. The attachment and ALL its files (thumbnails, scaled versions) are permanently deleted.

## Audit trail

Every successful deletion is logged under category `media`, event `attachment_deleted`, with MIME type.

## Anti-patterns

- Deleting without verifying the attachment first — always check with `maxi/get-attachment`.
- Deleting attachments that are currently set as featured images — check and remove featured image first.
- Bulk deleting without confirmation — this is permanent and irreversible.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/set-featured-image' => [
        'title'   => 'Set Featured Image',
        'content' => <<<'MD'
# maxi/set-featured-image

Set or remove the featured image (post thumbnail) on a post.

## PHP-enforced checks

- **Object existence:** target post must exist. If setting (not removing), attachment must exist and be of type `attachment`.
- **Per-object capability:** `edit_post` checked against the specific post ID.
- **Capability:** `edit_posts` (permission_callback).

## Workflow

### Set featured image
1. Verify the attachment exists (use `maxi/get-attachment`).
2. Call with `post_id` and `attachment_id`.

### Remove featured image
1. Call with `post_id` and `attachment_id: 0`.

## Audit trail

- Setting: logged as `featured_image_set` with the attachment ID.
- Removing: logged as `featured_image_removed` with the previous attachment ID.

## Anti-patterns

- Setting a non-image attachment as featured image — technically works but unexpected in most themes.
- Not verifying the attachment exists before setting.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/attach-media' => [
        'title'   => 'Attach Media',
        'content' => <<<'MD'
# maxi/attach-media

Attach an existing media item to a parent post. Changes the attachment's `post_parent` field.

## PHP-enforced checks

- **Object existence:** both attachment and parent post must exist. Attachment must be of type `attachment`.
- **Per-object capability:** `edit_post` checked against the parent post ID.
- **Capability:** `edit_posts` (permission_callback).

## Workflow

1. Call with `attachment_id` and `parent_id`.
2. The attachment's parent is updated to the specified post.

## Audit trail

Every successful attach is logged under category `media`, event `media_attached`, with the parent post ID.

## When to use

- After uploading an unattached file, to associate it with a specific post.
- To reorganize media library attachments.

## Anti-patterns

- Attaching to a post the user cannot edit.
- Using this to "move" an attachment — it changes parent, not location.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/detach-media' => [
        'title'   => 'Detach Media',
        'content' => <<<'MD'
# maxi/detach-media

Detach a media item from its parent post, making it unattached (sets `post_parent` to 0).

## PHP-enforced checks

- **Object existence:** attachment must exist and be of type `attachment`.
- **Per-object capability:** `edit_post` checked against the attachment ID.
- **Capability:** `edit_posts` (permission_callback).

## Workflow

1. Call with `attachment_id`.
2. The attachment's parent is set to 0 (unattached).

## Audit trail

Every successful detach is logged under category `media`, event `media_detached`, with the previous parent post ID.

## Anti-patterns

- Detaching a featured image without removing it from the post first — the featured image reference remains even after detaching.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/regenerate-thumbnails' => [
        'title'   => 'Regenerate Thumbnails',
        'content' => <<<'MD'
# maxi/regenerate-thumbnails

Regenerate all image sizes for a given attachment. Useful after theme changes that register new image sizes.

## PHP-enforced checks

- **Object existence:** attachment must exist and be of type `attachment`.
- **Image check:** attachment must be an image (`wp_attachment_is_image`).
- **Capability:** `upload_files` (permission_callback).

## Workflow

1. Call with `attachment_id`.
2. All registered image sizes are regenerated from the original file.
3. Returns the list of generated sizes and count.

## Audit trail

Every successful regeneration is logged under category `media`, event `thumbnails_regenerated`, with the list of sizes generated.

## When to use

- After a theme change that registers new image sizes.
- When image sizes appear broken or missing.
- After manual file replacement.

## Anti-patterns

- Regenerating thumbnails in bulk via repeated calls — use WP-CLI `wp media regenerate` for bulk operations.
- Calling on non-image attachments — will fail with a clear error.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── Notes ──────────────────────────────────────────────────────────

    'maxi/create-note' => [
        'title'   => 'Create Note',
        'content' => <<<'MD'
# maxi/create-note

Create a persistent note in the `maxi_ai_notes` table. Notes are the cross-session memory and communication system.

## PHP-enforced checks

- **Capability:** any logged-in user (`is_user_logged_in`).
- **Author:** automatically set to `current_user_id()`.

## Note types

- `agent-knowledge` — reusable how-tos, workarounds, solutions. Write these after solving an unexpected problem so future sessions can reference them.
- `agent-note` — bug reports, feedback, suggestions, observations. Use topic `bug` or `optimization`.
- `operator-note` — operator instructions to agents. Only operators should create these.

## Fields

- **title** (required): one-line summary.
- **content** (required): markdown body. Start with summary, use bullets and code blocks.
- **type** (required): one of the three types above.
- **status**: set automatically based on type. Do not override.
  - `agent-knowledge` → defaults to `review`. Valid: `review`, `active`, `idle`, `archived`.
  - `agent-note` → defaults to `open`. Valid: `open`, `acknowledged`, `verify`, `fix`, `resolved`, `archived`.
  - `operator-note` → defaults to `review`. Valid: `review`, `active`, `idle`, `archived`.
- **topic**: `bug`, `optimization`, `how-to`, `policy`, `warning`, `feedback`.
- **priority**: `low`, `medium`, `high`, `critical`.
- **assigned_to** (optional): WordPress user ID. When set, only that agent should act on the note. Omit or null = unassigned (any agent can act).

## Workflow

1. Before creating a knowledge note, search `maxi/list-notes` to avoid duplicates.
2. Create with appropriate type, topic, and priority.
3. **agent-knowledge:** starts `review` → operator approves → `active` → `idle` when outdated → `archived` when retired.
4. **agent-note:** starts `open` → dev acknowledges → `acknowledged` → dev fixes → `verify` → agent tests → `resolved` or `fix`.
5. **operator-note:** starts `review` → operator activates → `active` → `idle` when temporarily disabled → `archived` when retired. Agents must NOT change operator-note status autonomously.

## Audit trail

Every note creation is logged under category `notes`, event `note_created`.

## Session side-effect

Creating a note marks it as "read" for the current MCP session. You can change its status via `maxi/update-note` without first calling `maxi/get-note` — you already have full context since you just created it.

## Anti-patterns

- Creating duplicate notes — always search first.
- Using `operator-note` type when you are an agent.
- Writing vague titles — be specific ("Menu item CSS class not applied on page 42" not "CSS issue").
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/list-notes' => [
        'title'   => 'List Notes',
        'content' => <<<'MD'
# maxi/list-notes

Read-only. List and search notes with filters. Use this before creating notes (check for duplicates) and at session start (check for operator instructions).

## PHP-enforced checks

- **Capability:** any logged-in user (`is_user_logged_in`).

## Filters

- `type`: filter by note type (`agent-knowledge`, `agent-note`, `operator-note`).
- `status`: filter by status. For agent-note: `open`, `acknowledged`, `verify`, `fix`, `resolved`, `archived`. For operator-note: `review`, `active`, `idle`, `archived`. For agent-knowledge: `review`, `active`, `idle`, `archived`.
- `exclude_status`: exclude notes with this status (e.g. `archived`).
- `topic`: filter by topic.
- `priority`: filter by priority.
- `assigned_to`: filter by assigned user ID. Use `0` to find unassigned notes.
- `search`: free-text search in title and content.
- `include_content`: set `false` for lightweight listing without note bodies.
- Pagination: `per_page` (default 20, max 100), `page`.

## Session start

Call `maxi/bootstrap-session` before any other ability. Bootstrap returns active operator-notes (authoritative instructions) and knowledge note headers automatically. Use `list-notes` for additional queries (e.g., searching knowledge by keyword, checking agent-note status).

## Other workflows

- **Before creating a note:** search to avoid duplicates.
- **During troubleshooting:** if your first attempt fails, search `agent-knowledge` again with different keywords before trying more approaches.

## Anti-patterns

- Listing all notes without filters on a busy site.
- Ignoring operator-notes at session start.
- Skipping the knowledge check — always search before starting a task.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/get-note' => [
        'title'   => 'Get Note',
        'content' => <<<'MD'
# maxi/get-note

Read-only. Retrieve a single note by ID, including the last 20 comments.

## PHP-enforced checks

- **Capability:** any logged-in user (`is_user_logged_in`).
- **Object existence:** note must exist.

## Workflow

1. Call with `note_id`.
2. Returns full note details including title, content, type, status, topic, priority, author, dates, and recent comments.

## Important

- For **agent-notes**: always read comments before acting. Comments may contain corrections, test results, or context that changes how you should act.
- **Operator-notes** are authoritative instructions from bootstrap. Do NOT change their status autonomously. Comments on operator-notes are non-authoritative.

## Session side-effect

Calling this ability marks the note as "read" for the current MCP session. This satisfies the **read-before-status-change** guard on `maxi/update-note` — you can then change this note's status without being blocked.

The read flag is **consumed on use**: each successful status transition clears it. You must re-read the note (call `maxi/get-note` again) before making another status transition. This prevents acting on stale data when other agents have modified the note between your status changes.

## Anti-patterns

- Acting on an agent-note without reading its comments first.
- Changing operator-note status without explicit operator instruction.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/update-note' => [
        'title'   => 'Update Note',
        'content' => <<<'MD'
# maxi/update-note

Update a note's title, content, status, topic, priority, or assignment.

## PHP-enforced checks

- **Capability:** any logged-in user (`is_user_logged_in`).
- **Object existence:** note must exist.
- **Content ownership (PHP-enforced):** if changing the `content` field, the current user must be the note's author OR have `manage_options`. Non-authors can still change status, topic, priority, and assignment.
- **Knowledge status (PHP-enforced):** changing the `status` of an `agent-knowledge` note requires `manage_options`. This enforces the maker-checker pattern — agents create knowledge, only administrators can approve, idle, or archive it.
- **Status transitions (PHP-enforced):** status changes must follow the transition map below. Invalid transitions are rejected with `invalid_transition` error code and the list of valid targets from the current state. Same-status updates are silently ignored (no-op). `archived` is terminal — no outbound transitions.
- **Read-before-status-change (PHP-enforced, consume-on-use):** real status transitions (not same-status no-ops) require the note to have been read via `maxi/get-note` (or created via `maxi/create-note`) in the current MCP session. Each successful transition **consumes** the read flag — you must re-read before the next transition. The check blocks the entire mutation (no fields are written). Error code: `note_not_read`. Non-MCP callers (WP-CLI, cron, direct PHP) are not affected.

## Status transitions (per type)

All transitions are **PHP-enforced**. Invalid transitions are rejected with an error listing valid targets.

**agent-note:**

- `open` → `acknowledged`, `archived`
- `acknowledged` → `verify`, `archived`
- `verify` → `resolved`, `fix`, `archived`
- `fix` → `verify`, `archived`
- `resolved` → `archived`
- `archived` → (terminal — no transitions)

**Never skip `verify`.** When you apply a fix, set status to `verify` — do NOT jump straight to `resolved`. A note at `verify` means you MUST run a test to confirm the fix works.

**operator-note:**

- `review` → `active`, `archived`
- `active` → `idle`, `archived`
- `idle` → `active`, `archived`
- `archived` → (terminal — no transitions)

**Agents must NOT change operator-note status autonomously.** Only change when explicitly instructed by the operator.

**agent-knowledge** (status changes are **admin-only**, PHP-enforced):

- `review` → `active`, `archived`
- `active` → `idle`, `archived`
- `idle` → `active`, `archived`
- `archived` → (terminal — no transitions)

**Agents must NOT change agent-knowledge status.** Only administrators can approve, idle, or archive knowledge. This is the maker-checker pattern: agents create knowledge at `review`, operators decide when it becomes `active`.

## Assignment

- **assigned_to** (optional): WordPress user ID to assign this note to, or null to unassign.
- When set, only the assigned agent should act on the note.
- When null/omitted, any agent can act on the note.
- Assignment changes are unrestricted — any logged-in user can assign or unassign.

## Audit trail

Every note update is logged under category `notes`, event `note_updated`, with the list of changed fields.

## Anti-patterns

- Skipping the `verify` step on agent-notes — always test before resolving.
- Attempting invalid status transitions — these are now PHP-rejected with an error explaining valid transitions.
- Using ticket statuses (`open`, `verify`, `fix`) on agent-knowledge or operator-note types.
- Changing operator-note status without explicit operator instruction.
- Changing agent-knowledge status as a non-admin — this is PHP-blocked.
- Editing another user's note content without admin privileges.
- Using `maxi/delete-note` instead of `status: archived`.
- Commenting just to say "I read this" — use status changes instead.
- Changing note status without reading the note first — always call `maxi/get-note` to see current comments, assignment, and context before any status transition.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/delete-note' => [
        'title'   => 'Delete Note',
        'content' => <<<'MD'
# maxi/delete-note

Permanently delete a note and all its comments. This is irreversible.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).
- **Object existence:** note must exist.

## Workflow

1. Prefer `maxi/update-note` with `status: archived` over deletion — archived notes preserve history.
2. Only delete notes that contain incorrect or harmful information that should not be preserved.

## Audit trail

Every deletion is logged under category `notes`, event `note_deleted`.

## Anti-patterns

- Deleting notes instead of archiving them.
- Deleting notes with active comment threads — context is lost permanently.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/add-note-comment' => [
        'title'   => 'Add Note Comment',
        'content' => <<<'MD'
# maxi/add-note-comment

Post a comment on an existing note. Comments are append-only and cannot be edited or deleted.

## Required fields

- `note_id` — the note to comment on.
- `author_name` — who is posting. Use the format `agent-name@site-slug`, e.g. `dev-agent@docu` or `store-agent@vanillawp`.
- `content` — the comment body in markdown.

## PHP-enforced checks

- **Capability:** any logged-in user (`is_user_logged_in`).
- **Object existence:** the target note must exist.
- **Author ID:** automatically set to `current_user_id()`.

## When to comment

- When you have test results the note author needs to see.
- When you have clarifications or corrections to add.
- When the note's context has changed and others should know.
- When verification of a fix succeeds or fails — explain what you tested.

## When NOT to comment

- Just to say "I read this" — status changes speak for themselves.
- To repeat information already in the note or earlier comments.

## Audit trail

Every comment is logged under category `notes`, event `note_comment_added`.

## Anti-patterns

- Commenting without reading existing comments first (use `maxi/get-note`).
- Using comments for back-and-forth discussion — notes are async, not chat.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/list-note-comments' => [
        'title'   => 'List Note Comments',
        'content' => <<<'MD'
# maxi/list-note-comments

Read-only. List comments on a note in chronological order with pagination.

## PHP-enforced checks

- **Capability:** any logged-in user (`is_user_logged_in`).
- **Object existence:** the target note must exist.

## When to use

- When a note has more than 20 comments and `maxi/get-note` only returns the last 20.
- To see the full comment history in chronological order.

## Anti-patterns

- Using this when `maxi/get-note` already shows all comments (fewer than 20).
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    // ─── WooCommerce: Products ──────────────────────────────────────────

    'maxi/get-product' => [
        'title'   => 'Get Product',
        'content' => <<<'MD'
# maxi/get-product

Read-only. Get a WooCommerce product with full data: prices, stock, attributes (with taxonomy/term details), variations, dimensions, images.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required:** returns error if WooCommerce is not active.
- **Object existence:** product must exist.

## When to use

- Before updating a product — read current state first.
- To get attribute configuration before setting variations.
- To check stock levels or pricing.

## Anti-patterns

- Fetching products in a loop — use `maxi/list-products` for bulk reads.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/list-products' => [
        'title'   => 'List Products',
        'content' => <<<'MD'
# maxi/list-products

Read-only. List WooCommerce products with WC-specific filters.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**

## Filters

- `type`: simple, variable, grouped, external.
- `stock_status`: instock, outofstock, onbackorder.
- `on_sale`: boolean.
- `min_price`, `max_price`: price range (query-level filtering, pagination-safe).
- `category`, `tag`: taxonomy filters.
- Standard pagination: `per_page`, `page`, `orderby`, `order`.

## When to use

- To find products matching criteria before bulk operations.
- To audit stock levels or pricing across the catalog.

## Anti-patterns

- Listing all products without filters on large catalogs.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/update-product' => [
        'title'   => 'Update Product',
        'content' => <<<'MD'
# maxi/update-product

Update WooCommerce product data: prices, stock, SKU, dimensions, visibility, and more.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**
- **Object existence:** product must exist.

## Workflow

1. Read current product state with `maxi/get-product`.
2. Send only the fields you want to change.
3. Returns updated product data.

## Audit trail

Logged under category `woocommerce`, event `product_updated`, with list of updated fields.

## Anti-patterns

- Updating without reading current state first.
- Setting stock quantity without checking current stock management settings.
- Changing product type here — use `maxi/set-product-type` instead.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/get-product-attributes' => [
        'title'   => 'Get Product Attributes',
        'content' => <<<'MD'
# maxi/get-product-attributes

Read-only. Get attribute configuration for a product — taxonomy vs custom, terms, variation flags.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**
- **Object existence:** product must exist.

## When to use

- Before setting attributes — understand current configuration.
- Before creating variations — verify which attributes are used for variations.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/set-product-attributes' => [
        'title'   => 'Set Product Attributes',
        'content' => <<<'MD'
# maxi/set-product-attributes

Set product attributes with automatic taxonomy detection. Replaces all attributes on the product.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**
- **Object existence:** product must exist.

## Taxonomy attributes (`pa_*`)

For taxonomy-based attributes, `options` accepts term IDs, slugs, or names. Existing terms are resolved by ID → slug → name before creating new terms. This prevents `-2` slug duplicates.

## Custom attributes

For non-taxonomy attributes, stores plain strings.

## Audit trail

Logged under category `woocommerce`, event `product_attributes_set`, with attribute count.

## Workflow

1. Read current attributes with `maxi/get-product-attributes`.
2. Send the complete attribute set (this replaces, not merges).
3. For variation attributes, set `variation: true`.

## Anti-patterns

- Setting attributes without reading current ones first — this is a replace operation.
- Creating taxonomy terms manually then referencing them — pass names/slugs and let the resolver handle deduplication.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/set-product-type' => [
        'title'   => 'Set Product Type',
        'content' => <<<'MD'
# maxi/set-product-type

Change a product's type (simple, variable, grouped, external).

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**
- **Object existence:** product must exist.

## Audit trail

Logged under category `woocommerce`, event `product_type_changed`, with the new type.

## Anti-patterns

- Changing to `variable` without setting attributes first.
- Changing from `variable` to `simple` without cleaning up variations.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/create-variation' => [
        'title'   => 'Create Variation',
        'content' => <<<'MD'
# maxi/create-variation

Create a product variation with attribute combination, price, stock, and SKU.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**
- **Object existence:** parent product must exist and be variable type.

## Workflow

1. Ensure the parent product is type `variable` (use `maxi/set-product-type` if needed).
2. Set variation attributes on the parent (use `maxi/set-product-attributes` with `variation: true`).
3. Create the variation with attribute values, price, stock, and SKU.

## Audit trail

Logged under category `woocommerce`, event `variation_created`, with parent product ID.

## Anti-patterns

- Creating variations without setting parent attributes first.
- Creating duplicate attribute combinations.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/update-variation' => [
        'title'   => 'Update Variation',
        'content' => <<<'MD'
# maxi/update-variation

Update a variation's attributes, price, stock, SKU, dimensions, or image.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**
- **Object existence:** variation must exist.

## Workflow

1. List variations with `maxi/list-variations` to find the variation ID.
2. Send only the fields you want to change.

## Audit trail

Logged under category `woocommerce`, event `variation_updated`, with parent product ID.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/delete-variation' => [
        'title'   => 'Delete Variation',
        'content' => <<<'MD'
# maxi/delete-variation

Permanently delete a product variation. Irreversible.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**
- **Object existence:** variation must exist.

## Audit trail

Logged under category `woocommerce`, event `variation_deleted`, with parent product ID.

## Anti-patterns

- Deleting variations without checking if orders reference them — orphaned order line items may result.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/list-variations' => [
        'title'   => 'List Variations',
        'content' => <<<'MD'
# maxi/list-variations

Read-only. List all variations of a variable product.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**
- **Object existence:** parent product must exist.

## Pagination

Optional. By default returns all variations. Pass `per_page` (max 100) and `page` to paginate — useful for products with many variations to avoid timeouts.

## When to use

- Before updating or deleting specific variations — find the right variation ID.
- To audit variation pricing and stock across a product.
- For products with many variations, use `per_page` / `page` to paginate.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/bulk-update-prices' => [
        'title'   => 'Bulk Update Prices',
        'content' => <<<'MD'
# maxi/bulk-update-prices

Update prices for multiple products and/or variations in a single call. Supports exact values or percentage adjustments.

## PHP-enforced checks

- **Capability:** `edit_products`.
- **WooCommerce required.**

## Adjustment types

- **Exact:** set `regular_price` and/or `sale_price` to specific values.
- **Percentage:** apply a percentage increase or decrease to current prices.

## Audit trail

Logged under category `woocommerce`, event `prices_bulk_updated`, with count of updated items.

## Anti-patterns

- Applying percentage adjustments without checking current prices first.
- Not testing on a small batch before applying to the full catalog.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── WooCommerce: Orders ────────────────────────────────────────────

    'maxi/create-order' => [
        'title'   => 'Create Order',
        'content' => <<<'MD'
# maxi/create-order

Create a WooCommerce order with line items, customer, addresses, and status.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**

## Audit trail

Logged under category `woocommerce`, event `order_created`, with order status.

## Anti-patterns

- Creating orders without setting proper billing/shipping addresses.
- Setting status to `completed` on creation without payment — use `pending` or `processing`.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/get-order' => [
        'title'   => 'Get Order',
        'content' => <<<'MD'
# maxi/get-order

Read-only. Get full order details including line items, totals, addresses, payment method, and notes.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
- **Object existence:** order must exist.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/list-orders' => [
        'title'   => 'List Orders',
        'content' => <<<'MD'
# maxi/list-orders

Read-only. List orders with filters for status, customer, and date range.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**

## Filters

- `status`: pending, processing, on-hold, completed, cancelled, refunded, failed.
- `customer`: customer ID.
- `date_min`, `date_max`: date range.
- Pagination: `per_page`, `page`.

## WooCommerce analytics note

There are no dedicated WooCommerce analytics CLI commands. To answer questions about revenue, top products, or order trends, use this ability with date filters and compute metrics from the returned data.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/update-order-status' => [
        'title'   => 'Update Order Status',
        'content' => <<<'MD'
# maxi/update-order-status

Change an order's status with an optional note.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
- **Object existence:** order must exist.

## Audit trail

Logged under category `woocommerce`, event `order_status_changed`, with old and new status.

## Anti-patterns

- Changing status without understanding WooCommerce status flow (e.g. `cancelled` → `completed` skips payment).
- Not adding a note explaining why the status changed.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/add-order-note' => [
        'title'   => 'Add Order Note',
        'content' => <<<'MD'
# maxi/add-order-note

Add a private or customer-visible note to an order.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
- **Object existence:** order must exist.

## Note types

- **Private** (`customer_note: false`): visible only to admins in the order dashboard.
- **Customer-visible** (`customer_note: true`): also emailed to the customer.

## Audit trail

Logged under category `woocommerce`, event `order_note_added`, with customer_note flag.

## Anti-patterns

- Sending customer-visible notes for internal tracking — use private notes.
- Adding notes without useful context.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── WooCommerce: Coupons ───────────────────────────────────────────

    'maxi/create-coupon' => [
        'title'   => 'Create Coupon',
        'content' => <<<'MD'
# maxi/create-coupon

Create a WooCommerce coupon with discount type, amount, limits, and restrictions.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**

## Audit trail

Logged under category `woocommerce`, event `coupon_created`, with coupon code.

## Anti-patterns

- Creating coupons without usage limits — always set `usage_limit` or `usage_limit_per_user`.
- Using easily guessable coupon codes.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/get-coupon' => [
        'title'   => 'Get Coupon',
        'content' => <<<'MD'
# maxi/get-coupon

Read-only. Get coupon details by ID or code, including usage statistics.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
- **Object existence:** coupon must exist.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/update-coupon' => [
        'title'   => 'Update Coupon',
        'content' => <<<'MD'
# maxi/update-coupon

Update coupon amount, expiry, limits, or restrictions.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
- **Object existence:** coupon must exist.

## Audit trail

Logged under category `woocommerce`, event `coupon_updated`.

## Workflow

1. Read current coupon with `maxi/get-coupon`.
2. Send only the fields you want to change.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/delete-coupon' => [
        'title'   => 'Delete Coupon',
        'content' => <<<'MD'
# maxi/delete-coupon

Permanently delete a coupon. Irreversible.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
- **Object existence:** coupon must exist.

## Audit trail

Logged under category `woocommerce`, event `coupon_deleted`, with coupon code.

## Anti-patterns

- Deleting active coupons that customers may still be using.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/list-coupons' => [
        'title'   => 'List Coupons',
        'content' => <<<'MD'
# maxi/list-coupons

Read-only. List coupons with optional filters.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    // ─── WooCommerce: Shipping ──────────────────────────────────────────

    'maxi/list-shipping-zones' => [
        'title'   => 'List Shipping Zones',
        'content' => <<<'MD'
# maxi/list-shipping-zones

Read-only. List all shipping zones with regions and methods, including each method's full instance settings.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**

## When to use

- Before adding or updating shipping methods — read current configuration first.
- Settings keys vary by method type — this ability shows you what keys exist.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/create-shipping-zone' => [
        'title'   => 'Create Shipping Zone',
        'content' => <<<'MD'
# maxi/create-shipping-zone

Create a shipping zone with region restrictions.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**

## Audit trail

Logged under category `woocommerce`, event `shipping_zone_created`.

## Workflow

1. Create the zone with name and region restrictions.
2. Add shipping methods to the zone with `maxi/add-shipping-method`.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/add-shipping-method' => [
        'title'   => 'Add Shipping Method',
        'content' => <<<'MD'
# maxi/add-shipping-method

Add a shipping method to a zone (flat_rate, free_shipping, local_pickup).

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**

## Audit trail

Logged under category `woocommerce`, event `shipping_method_added`, with method type.

## Workflow

1. Create or identify the zone with `maxi/list-shipping-zones` or `maxi/create-shipping-zone`.
2. Add the method to the zone.
3. Configure method settings with `maxi/update-shipping-method`.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/update-shipping-method' => [
        'title'   => 'Update Shipping Method',
        'content' => <<<'MD'
# maxi/update-shipping-method

Update an existing shipping method instance — partial merge of settings and optional enabled toggle.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**

## Settings keys

Keys vary by method type. Common keys: `cost`, `tax_status`, `title`, `min_amount`, `requires`. Read via `maxi/list-shipping-zones` first to see available keys for each method type.

## Audit trail

Logged under category `woocommerce`, event `shipping_method_updated`, with instance ID.

## Workflow

1. Read current settings via `maxi/list-shipping-zones`.
2. Send only the settings you want to change — this is a partial merge, not a replace.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── WooCommerce: Tax Rates ─────────────────────────────────────────

    'maxi/create-tax-rate' => [
        'title'   => 'Create Tax Rate',
        'content' => <<<'MD'
# maxi/create-tax-rate

Create a tax rate for a country/state.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**

## Audit trail

Logged under category `woocommerce`, event `tax_rate_created`, with country.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/update-tax-rate' => [
        'title'   => 'Update Tax Rate',
        'content' => <<<'MD'
# maxi/update-tax-rate

Update an existing tax rate. Send only fields to change; booleans can be set to false.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
- **Object existence:** tax rate must exist.

## Audit trail

Logged under category `woocommerce`, event `tax_rate_updated`.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/list-tax-rates' => [
        'title'   => 'List Tax Rates',
        'content' => <<<'MD'
# maxi/list-tax-rates

Read-only. List tax rates with optional filters.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/delete-tax-rate' => [
        'title'   => 'Delete Tax Rate',
        'content' => <<<'MD'
# maxi/delete-tax-rate

Delete a tax rate. Irreversible.

## PHP-enforced checks

- **Capability:** `manage_woocommerce`.
- **WooCommerce required.**
- **Object existence:** tax rate must exist.

## Audit trail

Logged under category `woocommerce`, event `tax_rate_deleted`.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── Yoast SEO ──────────────────────────────────────────────────────

    'maxi/set-yoast-term-seo' => [
        'title'   => 'Rules for maxi/set-yoast-term-seo',
        'content' => <<<'MD'
# Rules for `maxi/set-yoast-term-seo`

Sets the Yoast SEO title and/or meta description for a taxonomy term. Creates the Yoast record if it does not exist yet — unlike `wp option patch`, which cannot bootstrap missing nested parents in `wpseo_taxonomy_meta`.

## Required fields

- `term_id` — the term to update.
- `taxonomy` — the taxonomy the term belongs to (e.g. `product_cat`, `category`).

## At least one of

- `title` — Yoast SEO title. Omit to leave unchanged.
- `description` — Yoast SEO meta description. Omit to leave unchanged.

If neither is provided, the call is rejected.

## Input validation (PHP-enforced)

- **Taxonomy existence:** the taxonomy must be registered.
- **Term existence:** the term must exist in the given taxonomy.
- **Yoast active:** returns an error if `WPSEO_VERSION` is not defined.
- **Capability:** `manage_categories`.

## Behavior

- Reads `wpseo_taxonomy_meta`, ensures `[taxonomy][term_id]` exists, merges the provided fields, and writes the option back.
- Does NOT overwrite fields that were not provided — other Yoast keys (canonical, noindex, content_score, linkdex) on the same term are preserved.
- When Yoast Indexables are available, also syncs the matching `wp_yoast_indexable` row so the change takes effect in the `<head>` immediately. Response includes `indexable_synced` to report whether this ran. If Indexables sync fails, the option write still succeeds and the failure is logged — not fatal.

## Audit trail

Logged under category `taxonomy`, event `yoast_term_seo_updated`, with `taxonomy`, `updated_fields`, and `indexable_synced` in the context.

## Anti-patterns

- Sending empty strings to "clear" fields — use explicit empty-string values if you really want to blank them, but prefer leaving the key out to avoid accidental overwrites.
- Using this ability to set canonical URL or noindex — not supported in this iteration. Only `title` and `description` are writable here.
- Calling on a taxonomy the current site doesn't register — the ability will reject, but check `maxi/list-terms` first.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── AI ─────────────────────────────────────────────────────────────

    'maxi/generate-text-ai' => [
        'title'   => 'Generate Text AI',
        'content' => <<<'MD'
# maxi/generate-text-ai

Generate text synchronously using AI. Supports OpenAI (GPT), Anthropic (Claude), and local providers.

## PHP-enforced checks

- **Capability:** `edit_posts`.
- **Provider configuration:** requires a valid API key for the selected provider.

## Workflow

1. Call with `prompt` and optional `provider`, `model`, `max_tokens`, `temperature`.
2. Returns generated text immediately.

## Anti-patterns

- Using this for bulk generation — use `maxi/generate-text-ai-batch` for multiple prompts.
- Not specifying temperature when reproducibility matters.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/generate-text-ai-batch' => [
        'title'   => 'Generate Text AI Batch',
        'content' => <<<'MD'
# maxi/generate-text-ai-batch

Submit a batch text generation job for multiple prompts. Returns a job ID — use `maxi/get-job-status` to check progress.

## PHP-enforced checks

- **Capability:** `edit_posts`.

## Workflow

1. Submit batch with array of prompts.
2. Receive job ID immediately.
3. Poll with `maxi/get-job-status` to check completion.
4. Results are available in the job status response.

## Anti-patterns

- Polling too frequently — wait at least 5 seconds between status checks.
- Using sync `maxi/generate-text-ai` in a loop instead of batch.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/generate-image-ai' => [
        'title'   => 'Generate Image AI',
        'content' => <<<'MD'
# maxi/generate-image-ai

Generate a single image synchronously. Returns an attachment immediately (sideloaded into media library).

## PHP-enforced checks

- **Capability:** `upload_files`.
- **Provider configuration:** requires a valid API key.

## Provider selection

**Do NOT set the `provider` parameter** unless the user explicitly requests a specific provider. The site has a configured default provider — omitting `provider` uses it automatically.

If a call fails with a provider error (billing, quota, downtime), retry **without** a provider override so the site fallback can kick in. Only force a specific provider when the user names one.

## Providers

Supports OpenAI (DALL-E 3, gpt-image-1), Replicate, BFL, and local providers.

## Options

- `seed`: for reproducibility.
- `background`: `transparent` / `opaque` / `auto` — `transparent` produces a real RGBA PNG via gpt-image-1.

## Anti-patterns

- **Forcing `provider: "openai"` (or any provider) without being asked** — this bypasses the site default and can hit billing limits on a provider the site doesn't intend to use.
- Using this for bulk generation — use `maxi/generate-image-ai-batch`.
- Not setting alt text on the resulting attachment.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/generate-image-ai-batch' => [
        'title'   => 'Generate Image AI Batch',
        'content' => <<<'MD'
# maxi/generate-image-ai-batch

Submit a batch image generation job. Returns job ID immediately — images are generated in the background and sideloaded into the media library.

## PHP-enforced checks

- **Capability:** `upload_files`.

## Workflow

1. Submit batch with array of prompts/parameters.
2. Receive job ID.
3. Poll with `maxi/get-job-status` to check progress.
4. Completed images are available as attachments in the media library.

## Anti-patterns

- Polling too frequently.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/edit-image-ai' => [
        'title'   => 'Edit Image AI',
        'content' => <<<'MD'
# maxi/edit-image-ai

Edit an existing image using AI. The edited image is sideloaded into the media library as a new attachment.

## PHP-enforced checks

- **Capability:** `upload_files`.
- **Object existence:** source attachment must exist.

## Mask behavior

- **OpenAI gpt-image-1 and BFL Kontext:** mask is optional — just describe the change in the prompt.
- **BFL Flux Fill and Replicate flux-fill-pro:** mask is required (precision inpainting).
- **Background removal:** use `background: "transparent"` with the OpenAI provider.

## Anti-patterns

- Providing a mask when using gpt-image-1 for simple edits — let the model decide what to change.
- Not keeping the original image — the edit creates a new attachment but doesn't delete the original.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/get-job-status' => [
        'title'   => 'Get Job Status',
        'content' => <<<'MD'
# maxi/get-job-status

Read-only. Get the status and progress of an AI batch job, including all items and their outputs.

## PHP-enforced checks

- **Capability:** `edit_posts`.
- **Object existence:** job must exist.

## Status values

- `pending`: queued, not yet started.
- `running`: actively processing items.
- `completed`: all items finished.
- `cancelled`: cancelled via `maxi/cancel-job`.
- `failed`: job-level failure.

## Anti-patterns

- Polling more frequently than every 5 seconds.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/cancel-job' => [
        'title'   => 'Cancel Job',
        'content' => <<<'MD'
# maxi/cancel-job

Cancel a pending or running AI batch job.

## PHP-enforced checks

- **Capability:** `edit_posts`.
- **Object existence:** job must exist.
- **Status check:** only pending or running jobs can be cancelled.

## Anti-patterns

- Cancelling completed jobs — they cannot be cancelled.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/get-ai-settings' => [
        'title'   => 'Get AI Settings',
        'content' => <<<'MD'
# maxi/get-ai-settings

Read-only. Return non-credential AI configuration: default providers, retry tuning, batch/worker tuning, HTTP timeout, openai_org_id, local_endpoint.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## Important

- API keys are **omitted** from the response. Use `maxi/list-provider-keys` for credential state.
- Never guess or fabricate AI settings — always read current state first.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/update-ai-settings' => [
        'title'   => 'Update AI Settings',
        'content' => <<<'MD'
# maxi/update-ai-settings

Update AI configuration: API keys, provider selection, retry/batch config. Merges with existing settings — only send fields to change.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## Security

- Keys are masked in the response — never returned in plain text.
- Credential writes are recorded in the audit log (category `key`).

## Workflow

1. Read current settings with `maxi/get-ai-settings`.
2. Send only the fields you want to change (merge, not replace).

## Anti-patterns

- Sending API keys in plain text in the prompt — provide them only via the ability parameter.
- Not reading current settings before updating.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/list-provider-keys' => [
        'title'   => 'List Provider Keys',
        'content' => <<<'MD'
# maxi/list-provider-keys

Read-only. List all AI provider credentials with masked key prefixes, rotation timestamps, age, and stale flags.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## Security

- **Never returns raw keys.** Only masked prefixes (e.g. `sk-proj-Ab...`).
- Shows `last_rotated_at`, `last_used_at`, and `age_days`.
- Keys older than 180 days are flagged as `stale`.

## When to use

- To audit credential health and identify stale keys.
- Before rotating a key — verify which provider you're targeting.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/rotate-provider-key' => [
        'title'   => 'Rotate Provider Key',
        'content' => <<<'MD'
# maxi/rotate-provider-key

Rotate a provider API key (or the local endpoint URL). Validates the new credential with a live test call before overwriting.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).
- **Live validation:** the new key is tested against the provider's API before saving. On failure, the old key stays in place.

## Audit trail

- **Success:** `rotated` event logged to category `key`.
- **Failure:** `validation_failed` event logged with the reason.

## Workflow

1. Check current key state with `maxi/list-provider-keys`.
2. Call `maxi/rotate-provider-key` with the provider and new key.
3. The ability tests the new key — if it works, it replaces the old one.

## Anti-patterns

- Rotating to an invalid key — validation prevents this, but don't waste API calls.
- Not checking `maxi/list-provider-keys` first to confirm which provider to target.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/get-audit-events' => [
        'title'   => 'Get Audit Events',
        'content' => <<<'MD'
# maxi/get-audit-events

Read-only. Query the Maxi AI audit log. Returns append-only events across all categories.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## Categories

- `key` — credential rotation, validation, settings writes.
- `content` — content CRUD, status changes, author/parent changes.
- `taxonomy` — term CRUD, term assignments.
- `meta` — meta set, delete, bulk update.
- `media` — uploads, deletions, featured image changes, attach/detach.
- `notes` — note CRUD, comments.
- `woocommerce` — product/order/coupon/shipping/tax mutations.
- `rules` — rule lookups, sync, refusals.
- `wp_cli` — WP-CLI command executions and rejections.
- `email` — email sends.
- `license` — license operations.

## Filters

- `category`: filter by event category.
- `event`: filter by specific event name.
- `since`: ISO timestamp — only return events after this time.

## When to use

- To audit what an agent did during a session.
- To verify security-sensitive operations (key rotation, content changes).
- To debug failed operations.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    // ─── System ─────────────────────────────────────────────────────────

    'maxi/get-site-info' => [
        'title'   => 'Get Site Info',
        'content' => <<<'MD'
# maxi/get-site-info

Read-only. Returns site name, URL, language, timezone, WP version, Maxi AI version and license status.

## PHP-enforced checks

- **Capability:** `read`.

## When to use

- At session start to understand the site context.
- To check license tier (`pro` or `free`) and status before using Pro-gated abilities.
- When a user asks about their license or version.

## Anti-patterns

- Guessing or fabricating license details — always call this ability.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/get-current-user' => [
        'title'   => 'Get Current User',
        'content' => <<<'MD'
# maxi/get-current-user

Read-only. Returns the current authenticated user's details, roles, and capabilities.

## PHP-enforced checks

- **Capability:** `read`.

## When to use

- To verify your own identity and capabilities.
- To understand what operations you can perform before attempting them.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/get-site-instructions' => [
        'title'   => 'Get Site Instructions',
        'content' => <<<'MD'
# maxi/get-site-instructions

Read-only. Returns the contents of CLAUDE.md for the site.

## PHP-enforced checks

- **Capability:** `read`.

## When to use

- At session start to load site-specific instructions.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/get-post-types' => [
        'title'   => 'Get Post Types',
        'content' => <<<'MD'
# maxi/get-post-types

Read-only. List all registered post types with their supports and taxonomies.

## PHP-enforced checks

- **Capability:** `read`.

## When to use

- To discover available post types before creating or querying content.
- To check what features a post type supports (e.g., editor, thumbnail, excerpts).
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/get-taxonomies' => [
        'title'   => 'Get Taxonomies',
        'content' => <<<'MD'
# maxi/get-taxonomies

Read-only. List all registered taxonomies with associated post types.

## PHP-enforced checks

- **Capability:** `read`.

## When to use

- To discover available taxonomies before managing terms.
- To check which taxonomies are associated with which post types.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/activate-license' => [
        'title'   => 'Activate License',
        'content' => <<<'MD'
# maxi/activate-license

Activate a Maxi AI Pro license key on this site.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## Workflow

1. User provides a license key.
2. Call this ability with the key.
3. The key is validated against the licensing server.
4. On success, the site is upgraded to Pro tier.

## Anti-patterns

- Guessing license keys.
- Activating without the user explicitly providing a key.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/deactivate-license' => [
        'title'   => 'Deactivate License',
        'content' => <<<'MD'
# maxi/deactivate-license

Deactivate the current license and revert to the free tier.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## Important

- This clears the stored key and reverts to free tier immediately.
- Only do this when the user explicitly requests it.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/list-files' => [
        'title'   => 'List Files',
        'content' => <<<'MD'
# maxi/list-files

**[PRO]** List files and subdirectories inside `wp-content/`. Returns names, sizes, modification dates.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).
- **Path restriction:** only `wp-content/` and subdirectories.

## Features

- Glob patterns: `*.log`, `fatal-*`, etc.
- Sorting by name or date.
- Subfolder navigation.

## When to use

- To find log files for debugging.
- To explore plugin/theme file structures.
- To check for large or unexpected files.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/read-file' => [
        'title'   => 'Read File',
        'content' => <<<'MD'
# maxi/read-file

**[PRO]** Read any file inside `wp-content/`, including PHP source for debugging.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).
- **Path restriction:** only `wp-content/` directory.
- **Blocked files:** wp-config.php, .env, .htaccess, and dangerous extensions (.sql, .pem, .sh).
- **Size limit:** max 500 KB.

## Features

- `tail_lines`: read only the last N lines (useful for large log files).

## When to use

- To debug PHP errors by reading source code or log files.
- To inspect plugin configuration files.

## Anti-patterns

- Trying to read files outside `wp-content/`.
- Trying to read sensitive configuration files.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/send-email' => [
        'title'   => 'Send Email',
        'content' => <<<'MD'
# maxi/send-email

**[PRO]** Send an email via `wp_mail()`. **Disabled by default** — must be explicitly enabled.

## PHP-enforced checks

- **Capability:** `is_user_logged_in` (but further gated by security option).
- **Security gate:** controlled by `maxi_ai_email_security` option or `MAXI_AI_EMAIL_SECURITY` constant. Must be set to `admin` or `open`.

## Security levels

- **disabled** (default): no emails can be sent.
- **admin**: only `manage_options` users can send.
- **open**: any logged-in user can send.

## "From" identity

Controlled by `maxi_ai_email_from` option:
- `wordpress`: site title + admin email.
- `woocommerce`: WC sender settings.
- `user`: current user identity.

## Audit trail

Every send is audit-logged (recipient, subject, from identity — no body for privacy).

## Anti-patterns

- Sending emails without user approval.
- Sending to external addresses without explicit instruction.
- Using HTML format for simple text messages.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/manage-mask-fields' => [
        'title'   => 'Manage Mask Fields',
        'content' => <<<'MD'
# maxi/manage-mask-fields

**[PRO]** Add, remove, or list field names in the GDPR data masking list.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## Behavior

Any ability response key matching a masked field has its value partially redacted before reaching the agent (e.g. "John" → "J***"). Seeded with common PII fields by default.

## Actions

- `list`: show current masked fields.
- `add`: add a field name to the mask list.
- `remove`: remove a field name from the mask list.

## When to use

- To comply with GDPR requirements for PII fields.
- To add custom sensitive fields specific to the site.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/register-categories' => [
        'title'   => 'Register Categories',
        'content' => <<<'MD'
# maxi/register-categories

Register custom ability categories for organization.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    // ─── Development ────────────────────────────────────────────────────

    'maxi/run-wp-cli' => [
        'title'   => 'Run WP-CLI',
        'content' => <<<'MD'
# maxi/run-wp-cli

This ability runs WP-CLI directly — it is NOT a shell. Pass WP-CLI command text only (subcommand, args, flags). Shell features do not work.

## Composing the command

**Output is already returned to you.** The response includes the full stdout and stderr under `data.output`. You don't need to redirect, capture, or pipe anything.

### Shell syntax that will be rejected

| Pattern | What to do instead |
|---|---|
| `wp post list > file.json` | Take the returned `output` field directly. |
| `wp option get home \| grep https` | Inspect the returned output yourself, or use WP-CLI's own filters (`--field=`, `--format=json`, `--fields=`). |
| `wp post list; wp user list` | Make two separate `maxi/run-wp-cli` calls. |
| `wp eval "$(cat file.php)"` | Not supported — `eval` is hard-banned regardless. |
| Backticks, `$(...)`, `\`, `{}`, `!` | No shell expansion happens. Pass literal values. |

Rejected characters (for commands other than `db query`): `;`, `|`, `&`, `` ` ``, `$`, `(`, `)`, `<`, `>`, `{`, `}`, `!`, `\`, newlines. See the `db query` subsection below for the SQL-friendly subset.

**Quoting is fine.** Both `"..."` and `'...'` work for values with spaces: `option get "my option name"`.

### `db query` is SQL-friendly

Inside `db query "..."`, parentheses, `<`, `>`, `!`, and backtick-quoted identifiers ARE allowed — they are SQL syntax, not shell syntax. Example:

`db query "SELECT id, COUNT(*) FROM wp_posts WHERE post_date > '2026-01-01' AND id IN (1,2,3)"`

Still blocked inside `db query`: `;`, `|`, `&`, `$`, `{`, `}`, `\`, newlines. One statement per call — the `;` terminator is defensively blocked.

## Allowlist (summary)

- **Always allowed:** read-only commands (`post list`, `option get`, `user list`, `plugin list`, `core version`, …).
- **Opt-in via wp-config.php:**
  - `MAXI_AI_ALLOW_DB_READS` → `db query` (SELECT-only, output-blocklisted), `db export`
  - `MAXI_AI_ALLOW_PLUGIN_WRITES` → plugin activate/deactivate (install/delete via sub-constants)
  - `MAXI_AI_ALLOW_THEME_WRITES` → theme activate (install/delete via sub-constants)
  - `MAXI_AI_ALLOW_TRANSLATION_UPDATES` → language packs
- **Hard-banned regardless of constants:** `eval`, `eval-file`, `db drop`, `db reset`, `db create`, `config set`, `config delete`, `user delete`, …

If a command is rejected with `not_allowed`, the response's `enabling_constant_hint` field tells you which constant to set.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).
- **Shell metacharacters:** rejected pre-execution; response includes `rejected_char` and `disallowed_chars` so you can fix the call deterministically.
- **Allowlist:** prefix-based, non-bypassable.
- **DB reads:** `db query` accepts SELECT only; blocklisted SQL terms and blocklisted output terms both reject.
- **Audit:** every execution and rejection is recorded under category `wp_cli`.

## Anti-patterns

- Reaching for shell redirection — output is already returned to you.
- Chaining with `;` or `&&` — make separate calls.
- Running write commands without the enabling constant.
- Using `db query` for anything other than SELECT.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/manage-db-query-blocklist' => [
        'title'   => 'Manage DB Query Blocklist',
        'content' => <<<'MD'
# maxi/manage-db-query-blocklist

Add, remove, or list terms in the DB query output blocklist. Prevents sensitive data from appearing in `db query` results.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## Default blocked terms

Seeded on first use: `user_pass`, `user_activation_key`, `session_tokens`.

## Behavior

Blocked terms cause `db query` SELECT commands to be rejected if the term appears in the SQL text or in the query output.

## Actions

- `list`: show current blocklist terms.
- `add`: add a term to the blocklist.
- `remove`: remove a term from the blocklist.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

    'maxi/flush-cache' => [
        'title'   => 'Flush Cache',
        'content' => <<<'MD'
# maxi/flush-cache

Flush the WordPress object cache.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## When to use

- After making changes that should be immediately reflected.
- When debugging caching issues.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/clear-transients' => [
        'title'   => 'Clear Transients',
        'content' => <<<'MD'
# maxi/clear-transients

Delete expired transients or a specific transient by name.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## Modes

- **All expired:** delete all expired transients.
- **Specific:** delete a named transient.

## When to use

- To clean up expired transients.
- To force refresh of cached data stored in a specific transient.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    'maxi/regenerate-rewrites' => [
        'title'   => 'Regenerate Rewrites',
        'content' => <<<'MD'
# maxi/regenerate-rewrites

Flush and regenerate permalink rewrite rules.

## PHP-enforced checks

- **Capability:** `manage_options` (admin-only).

## When to use

- After changing permalink settings.
- After registering new post types or taxonomies.
- When 404 errors appear on pages that should exist.
MD
        ,
        'delivery_mode' => 'inline_on_success',
    ],

    // ─── System: Playbook Management ──────────────────────────────────

    'maxi/manage-playbooks' => [
        'title'   => 'Rules for maxi/manage-playbooks',
        'content' => <<<'MD'
# Rules for `maxi/manage-playbooks`

Operator CRUD for site-level playbooks. Administrator only (`manage_options`). Hidden from MCP discovery (`mcp.public = false`).

## CRITICAL: Playbooks are system-level instructions

Playbooks are **enforced instructions that affect all agent behavior across all sessions**. They are the highest level in the instruction hierarchy — above operator-notes and agent-knowledge. Modifying a playbook changes how every agent on this site operates.

## Before any modification (upsert or delete)

1. **Warn the operator explicitly.** Tell them: "You are about to modify a playbook. Playbooks are system-level instructions that control all agent behavior on this site. This change will take effect for all agents on the next bootstrap."
2. **Ask for explicit confirmation** before executing the upsert or delete action.
3. **Never modify playbooks autonomously.** Only execute when the operator explicitly instructs a playbook change.

## Read before write

Always call `get` on the playbook before calling `upsert`. Read the current content, understand what is there, then propose the change. Never overwrite blindly.

## Required playbooks cannot be deleted

The `delete` action is rejected for playbooks with `required = 1`. These playbooks are enforced by the bootstrap gate — removing them would block all agent sessions.

## Anti-pattern

Do NOT modify the operational playbook (`slug: operational`) unless the operator specifically asks to change behavioral rules. Changes to the operational playbook affect the core operating protocol for all agents.
MD
        ,
        'delivery_mode' => 'reject_first',
    ],

];
