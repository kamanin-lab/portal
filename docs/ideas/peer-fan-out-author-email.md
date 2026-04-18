# Peer fan-out strips author identity — fix root cause

> Status: Open | Priority: medium | Discovered: 2026-04-18 during weekly-summary v1.5 build

## Problem

When a portal user (org member) posts a comment via `post-task-comment`, the peer-notification fan-out writes rows into `comment_cache` for every other org member who should see the message. Those fanned-out rows are currently stored with:

- `is_from_portal = true` ✓ correct
- `author_email = ""` ✗ empty
- `author_name = "Marvin"` ✗ only first name
- `comment_text = "Marvin Pape (via Client Portal):\n\n..."` ✗ real author attribution buried in body text

The comment body prefix (`{Full Name} (via Client Portal):`) is the ONLY reliable source of the author's identity after fan-out.

## Real-world impact (observed 2026-04-17 in prod)

MBM's member Marvin Pape commented on Blog-Konzept. In admin Nadin's `comment_cache`:

```
author_email:    ""              ← should be "m.pape@reachlab.com"
author_name:     "Marvin"        ← should be "Marvin Pape"
comment_text:    "Marvin Pape (via Client Portal):\n\nHallo Yuri..."
```

Prod query: `SELECT * FROM comment_cache WHERE author_email = 'm.pape@reachlab.com'` returns **zero rows**, even though he has commented. Every peer-comment attribution in the database is partially broken.

## Where it breaks things

1. **Weekly summary v1.5** — peer detection now uses a proxy (`is_from_portal=true AND author_email != admin`) that happens to work because `"" != admin.email` is true. But we cannot reliably show "Marvin Pape" without parsing `comment_text`. Currently falls back to "Marvin".
2. **Any future "who replied" UI** — TaskComments, inbox, etc. will render "Marvin" instead of "Marvin Pape".
3. **Reporting / analytics** — can't count peer activity per user cleanly.
4. **Audit trail** — hard to trace which org member said what if email isn't stored.

## Root cause (suspected — needs verification)

In `supabase/functions/post-task-comment/index.ts`, the peer fan-out block was added in ADR-031 (2026-04-17). When it upserts comment_cache rows for peers, it likely copies `author_email`/`author_name` from the ClickUp-returned comment payload, which contains KAMANIN's service user (or nothing), rather than the portal user's identity.

The ClickUp POST request attributes the comment to the portal user via the `@client:` prefix strip logic, but in the webhook round-trip that context is lost.

## Proposed fix

When the fan-out writes peer rows, populate `author_email` and `author_name` from the **calling profile** (the portal user who just hit `post-task-comment`), not from the ClickUp response:

```ts
// In post-task-comment/index.ts, inside the fan-out loop per recipient:
await supabase.from("comment_cache").insert({
  profile_id: recipient.profile_id,
  task_id,
  clickup_comment_id,
  author_email: caller.email,        // ← NEW
  author_name: caller.full_name,     // ← NEW (full name, not first-only)
  comment_text,                      // keep the "(via Client Portal)" body prefix for now
  is_from_portal: true,
  clickup_created_at,
});
```

Also: consider stopping the "{Name} (via Client Portal):" body prefix once author metadata is properly populated. Cosmetic improvement.

## Backfill question

**Existing broken rows**: ~dozens already in prod with empty `author_email`. Options:
1. Leave as-is — only new comments get fixed identity; old rows remain parseable via `comment_text` prefix.
2. One-off migration script: parse the `(via Client Portal):` prefix + join to `profiles` by full_name/initial. Risky if full names are ambiguous within an org.
3. Rebuild from ClickUp webhook history — too complex.

Recommendation: option 1. Don't backfill. Let `comment_cache` populate correctly going forward; old rows are edge cases.

## Estimated effort

- Patch: ~30 min (one file, one block, clear fix).
- Testing: ~1h (reproduce in staging, verify end-to-end from client UI).
- Backfill: skipped per above.

**Total: ~1.5h**.

## Related

- ADR-031 (peer-to-peer org notifications)
- `docs/CHANGELOG.md` entry `feat(notifications): peer-to-peer org notifications — 2026-04-17`
- `supabase/functions/_shared/org.ts` — `getOrgContextForUserAndTask` (authorization side, works correctly)
- `docs/ideas/weekly-client-summary.md` — downstream consumer that worked around the bug
