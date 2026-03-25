# Team Dashboard

_Status: active_ · _Last updated: 2026-03-25_

## Current State
**Portal is LIVE at https://portal.kamanin.at**
First production client: MBM (Nadin Bonin). Auto-deploys from `main` via Vercel.

## Open Items
- Magic link login hidden — GoTrue SMTP needs configuration on self-hosted Supabase
- MBM modules: tickets + support active; projects not yet configured

## Completed Today (2026-03-25)
| Item | Notes |
|---|---|
| Vercel deployment | `main` → portal.kamanin.at, preview URLs on PRs |
| Repo consolidation | PORTAL_staging → PORTAL (single canonical repo) |
| Onboarding script | `scripts/onboard-client.ts` |
| MBM onboarded | First production client |
| Filter row fix | Chips + button on single row |
| Sidebar flat links | Tickets + support no longer have submenus |
| TaskCard creator | Shows `created_by_name` from DB |
| Message bubble polish | Padding, tail, gap applied to all 3 chat surfaces |
| Credit balance label | Strips hour suffix from package name |
| scrollbar-hide utility | Added to index.css for Tailwind v4 |
| Login KAMANIN icon | Official SVG replaces placeholder |
| Favicon | KAMANIN colour icon |
| Page title | "KAMANIN Portal" |
| Magic link hidden | Until GoTrue SMTP configured |

## Completed Tasks
### TASK-016 and prior: See git log and CHANGELOG.md.

Legend: ⬜ pending | 🔄 in progress | ✅ done | ❌ blocked | ⏭️ skipped
