# TASK-002: Project Panel Redesign

**Date:** 2026-03-22
**Status:** Complete

## What Was Done

Two-batch redesign of the project panel UI components. 21 files changed total.

### Batch 1: Layout Deduplication + Foundation
- Enforced single `ContentContainer` wrapper pattern across all project pages
- Removed duplicate `max-w-*` wrappers from project sub-pages
- Established `width="narrow"` as the canonical pattern (`max-w-4xl`, centered)
- Recorded as CLAUDE.md Architecture Rule 11

### Batch 2: Comments, Messaging, Quick Actions, Activity Timeline
- `TaskComments.tsx` — threaded comment display with author avatars, timestamps,
  portal-vs-team styling distinction
- `SupportChat.tsx` — chat-style message interface for the dedicated support task channel
- `SupportSheet.tsx` — slide-over Sheet wrapping SupportChat, URL-based state
- Quick actions panel — configurable action buttons (label, icon, counter pills)
- Activity timeline — chronological project event feed with type-icon rows

## Files Changed

21 files (2 batches)

## Key Commits

`f32db82` — feat(projects): ship project panel batch 1 foundation
