# ClickUp Integration Guide

> **For comprehensive ClickUp API reference** (endpoints, webhooks, custom fields, statuses), see the project skill:
> `.claude/skills/clickup-api/SKILL.md`
>
> This document covers portal-specific ClickUp threading implementation details only.

## Current Implementation (Phase 4)

### Core Changes
- **Threaded Reply Handling**: New `checkCommentThreadContext()` function handles timing-sensitive inbound replies
- **Edge Function Proxy**: All ClickUp API calls routed through Supabase Edge Functions for security/rate limiting
- **Cache Tables**: Comment threads indexed in Supabase for realtime UI updates

### Regression Test Coverage
1. **Early Reply Scenario**: Reply arrives before thread context is fully indexed
2. **Multiple Replies**: Concurrent replies to same thread
3. **Nested Replies**: Deeply nested comment chains
4. **Portal Suppression**: Portal-originated comments still suppress notifications correctly

### Known Timing Caveats
- 200-500ms delay possible between ClickUp webhook and cache update
- Thread context may be incomplete for ~1s after first reply
- Recommend UI loading states for first 2 seconds after reply submission

