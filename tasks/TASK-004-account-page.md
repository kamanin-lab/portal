# TASK-004: Account Page (Konto)

> Status: PRE-CODE REVIEWED | Created: 2026-03-22
> Review: APPROVE WITH CONDITIONS — blocking issues resolved below

## Goal
Build the client account page (`/konto`) with profile editing, granular email notification preferences, and logout.

## Scope

### In-scope
1. **New page** `KontoPage.tsx` at route `/konto`
2. **Profile section**: edit full_name (single field, as stored in DB)
3. **Email section**: display current email, change with Supabase Auth confirmation flow (`updateUser({ email })`). Show German instructional text: "Wir haben eine Bestätigungsemail an Ihre aktuelle und neue Adresse gesendet."
4. **Notification preferences** — granular toggles replacing the current `email_notifications` boolean:
   - `task_review` — Aufgabe zur Prüfung bereit (ON by default)
   - `task_completed` — Aufgabe abgeschlossen (ON by default)
   - `team_comment` — Neue Nachricht vom Team (ON by default)
   - `support_response` — Support-Antwort (ON by default)
   - `reminders` — Erinnerungen bei ausstehender Prüfung (ON by default, **render as disabled/coming soon** — no backend trigger exists yet)
5. **Logout button** — simple `supabase.auth.signOut()`
6. **Navigation**: clickable SidebarUserFooter → `/konto`, plus Konto link in MobileSidebarOverlay
7. **DB migration** — add `notification_preferences JSONB` to `profiles`, migrate existing boolean data
8. **Webhook update** — read granular preferences in `clickup-webhook` when deciding whether to send email
9. **AuthContext** — expose `refreshProfile()` so mutation hook can update in-memory profile

### Out-of-scope
- Active sessions / device management
- Password change (magic link auth, no password)
- Theme / language settings
- Avatar upload (display only if `avatar_url` exists)
- Credit budget display (future, after credit system)
- Updating `send-mailjet-email` (it's a dumb renderer, gate stays in webhook)

## Notification Preference ↔ Email Type Mapping

**CRITICAL: webhook must use this exact mapping when checking preferences:**

| Webhook email type sent | JSONB preference key to check | UI Label (German) |
|---|---|---|
| `task_review` | `task_review` | Aufgabe zur Prüfung bereit |
| `task_completed` | `task_completed` | Aufgabe abgeschlossen |
| `team_question` | `team_comment` | Neue Nachricht vom Team |
| `support_response` | `support_response` | Support-Antwort |
| _(no trigger yet)_ | `reminders` | Erinnerungen (coming soon) |

Note: `team_question` is the email type the webhook sends, but the user-facing preference key is `team_comment` (clearer for UI). The webhook must map `team_question` → check `team_comment` preference.

## Affected Files

### New files
- `src/shared/pages/KontoPage.tsx` — main account page
- `src/shared/hooks/useUpdateProfile.ts` — mutation hook for profile updates (calls `refreshProfile` on success)

### Modified files
- `src/app/routes.tsx` — add `/konto` route (lazy-loaded, inside ProtectedRoute/AppShell, no WorkspaceGuard)
- `src/shared/hooks/useAuth.ts` — expose `refreshProfile()` from AuthContextValue, update `STAGING_BYPASS_PROFILE` with `notification_preferences`
- `src/shared/types/common.ts` — extend Profile with `notification_preferences: NotificationPreferences`
- `src/shared/components/layout/SidebarUserFooter.tsx` — wrap avatar/name in NavLink to `/konto`
- `src/shared/components/layout/SidebarUtilities.tsx` — add Konto link (Settings icon)
- `src/shared/components/layout/MobileSidebarOverlay.tsx` — add Konto link for mobile
- `src/shared/components/layout/AppShell.tsx` — add `'/konto': 'Konto'` to PAGE_TITLES
- `supabase/functions/clickup-webhook/index.ts` — replace `if (profile.email_notifications)` with per-type JSONB check using mapping table above
- `docs/system-context/DATABASE_SCHEMA.md` — document `notification_preferences` column
- `docs/system-context/NOTIFICATION_MATRIX.md` — document granular preferences

### NOT modified (per review)
- `supabase/functions/send-mailjet-email/index.ts` — dumb renderer, no changes needed. Gate stays in webhook.
- `src/shared/components/layout/BottomNav.tsx` — no changes, mobile access via MobileSidebarOverlay instead

## DB Change

```sql
-- Add JSONB column with defaults (all ON)
ALTER TABLE profiles ADD COLUMN notification_preferences JSONB
  DEFAULT '{"task_review": true, "task_completed": true, "team_comment": true, "support_response": true, "reminders": true}'::jsonb;

-- Migrate existing data: if email_notifications = false, set all to false
UPDATE profiles
SET notification_preferences = '{"task_review": false, "task_completed": false, "team_comment": false, "support_response": false, "reminders": false}'::jsonb
WHERE email_notifications = false;

-- Keep email_notifications column for backward compat during transition
-- Drop after confirming all Edge Functions use new column
```

**Note:** Verify whether a DB trigger exists to sync `auth.users.email` → `profiles.email` after email change. If not, add one or handle in the auth state change listener.

## Implementation Order (from review)

1. DB migration — add `notification_preferences` column, run UPDATE
2. Extend `Profile` type + `useAuth.ts` (add `refreshProfile`, update bypass profile)
3. Create `useUpdateProfile.ts` mutation hook
4. Build `KontoPage.tsx` (profile, notifications, email, logout)
5. Add `/konto` route in `routes.tsx`
6. Update navigation: `SidebarUserFooter`, `SidebarUtilities`, `MobileSidebarOverlay`, `AppShell`
7. Update `clickup-webhook` — per-type JSONB preference checks
8. Update docs: `DATABASE_SCHEMA.md`, `NOTIFICATION_MATRIX.md`

## Constraints
- All UI text in German
- `ContentContainer width="narrow"` wrapper
- Components < 150 lines — extract sections into sub-components if needed
- RLS: users update only own profile (`auth.uid() = id`)
- Toast feedback for all save actions ("Änderungen gespeichert", "Bestätigungsemail gesendet")

## References
- `docs/system-context/NOTIFICATION_MATRIX.md` — current notification types
- `docs/system-context/DATABASE_SCHEMA.md` — profiles table schema
- `src/shared/hooks/useAuth.ts` — current auth context
- `src/shared/types/common.ts` — Profile type
- `docs/SPEC.md` — design tokens, component patterns

## Risks
- Email change: Supabase double confirmation (old + new). Clear UX messaging required.
- Migration: existing `email_notifications = false` users correctly set to all-false
- Transition window: keep old boolean column until webhook is redeployed with JSONB reads
- `reminders` toggle: no backend trigger — must render as disabled/coming soon
