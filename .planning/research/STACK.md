# Technology Stack Research: Multi-User Organisation Support

**Project:** KAMANIN Client Portal — v2.0 Organisations milestone
**Researched:** 2026-04-14
**Confidence:** HIGH (core patterns verified against official Supabase docs + existing codebase evidence)

---

## Summary

Adding multi-user org support to this portal requires three focused additions: a server-side invite flow that bypasses GoTrue's broken SMTP, org-scoped RLS policies using a `SECURITY DEFINER` helper, and a new `invite-member` Edge Function. The existing stack handles everything else — no new frontend frameworks, no new auth providers, no schema overhaul beyond what the `organizations.md` idea doc already specifies.

The critical insight: **GoTrue's `inviteUserByEmail` is not viable here because it depends on GoTrue SMTP to deliver the invite link.** But `auth.admin.createUser` with `email_confirm: true` plus a manually sent Mailjet invite email is fully achievable — and the existing `auth-email` hook already contains an `"invite"` case that would handle this natively if GoTrue SMTP were working. The workaround is to replicate that flow manually in the new Edge Function.

---

## Auth & Invite Stack

### The Problem

GoTrue SMTP is disabled on this self-hosted instance. Magic links are off. The built-in `inviteUserByEmail` sends an invite via GoTrue SMTP — so it would fail silently or return an SMTP error. The `auth-email` hook (which bypasses GoTrue SMTP) only fires for GoTrue-originated auth actions, not for a custom Edge Function.

**Confirmed:** The existing `auth-email/index.ts` already handles `email_action_type: "invite"` (line 16) and maps it to `"invite"` email copy (line 61). This code path exists but is unreachable when GoTrue SMTP is broken because GoTrue never calls the hook for invites.

### Recommended Approach: createUser + Manual Mailjet Email

**Flow:**

```
Admin POSTs /invite-member { email, orgId, role }
  → Edge Function (service_role client)
  → auth.admin.createUser({ email, email_confirm: true, password: <temp>, user_metadata: { org_id, role } })
  → INSERT INTO org_members (organization_id, profile_id, role)
  → Mailjet: send invite email with set-password link
  → Return 200
```

**Why createUser over inviteUserByEmail:**
- `inviteUserByEmail` requires GoTrue SMTP to deliver the token — broken on this instance
- `createUser` with `email_confirm: true` creates the user immediately, confirmed, no email from GoTrue
- You control email delivery entirely via Mailjet (already proven working)
- The invite link becomes a password-reset link: `auth.admin.generateLink({ type: "recovery", email })` to give the new user a way to set their own password

**Generating the set-password link (MEDIUM confidence — verify against current SDK):**

```typescript
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// 1. Create the user (confirmed, no GoTrue email)
const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
  email,
  email_confirm: true,
  password: crypto.randomUUID(), // temporary — user will reset
  user_metadata: { full_name: name }
})

// 2. Generate a password-reset link they can use to set their own password
const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
  type: 'recovery',
  email,
  options: { redirectTo: 'https://portal.kamanin.at/auth/set-password' }
})
// linkData.properties.action_link is the URL

// 3. Send via Mailjet using existing send-mailjet-email Edge Function
// Use "invite" email copy already in emailCopy.ts
```

**Why this works:**
- `generateLink({ type: 'recovery' })` does NOT require GoTrue SMTP — it just returns the URL
- The URL is a GoTrue verify link: `https://portal.db.kamanin.at/auth/v1/verify?token=...&type=recovery&redirect_to=...`
- User clicks → GoTrue verifies token → redirects to `/auth/set-password` → user calls `supabase.auth.updateUser({ password: newPassword })`
- Session is established from the redirect hash (access_token + refresh_token in URL fragment), so `updateUser` works

**Frontend set-password page:**

```typescript
// /auth/set-password page
// On mount: extract session from URL hash
const { data: { session } } = await supabase.auth.getSession()
// If no session yet (implicit flow), listen for SIGNED_IN event
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
    // now user is authenticated → show password form
  }
})
// On submit:
await supabase.auth.updateUser({ password: newPassword })
```

**Profile creation:** The existing `profiles` table likely has an `on_auth_user_created` trigger. Confirm this exists — if so, a profile row is auto-created. The Edge Function then just needs to `INSERT INTO org_members`.

**Confidence:** HIGH for the createUser + generateLink approach. Verified against Supabase JS SDK reference and GitHub discussions. The recovery link approach for new-user invite is a well-documented community pattern.

---

### invite-member Edge Function Spec

New function: `supabase/functions/invite-member/index.ts`

| Concern | Decision |
|---------|----------|
| Auth check | Require Bearer token; verify caller is org admin via `supabase.from('org_members').select('role').eq('profile_id', callerId).eq('organization_id', orgId)` |
| Admin client | `createClient(URL, SERVICE_ROLE_KEY)` — separate from the caller-scoped client |
| Idempotency | Check if email already in `auth.users` before calling `createUser`; if exists, check if already an org_member |
| Error: duplicate | Return 409 with message "Nutzer ist bereits Mitglied" |
| Email template | Add `"invite"` case to `emailCopy.ts` if not present (it's already mapped in `auth-email` hook) |
| Rate limiting | No built-in — acceptable for now (admin-only action) |

---

## RLS Patterns

### Core Pattern: SECURITY DEFINER helper + SELECT wrapper

The `user_org_ids()` function already specified in `organizations.md` is the right approach. Two refinements from current Supabase RLS best practices:

**1. Use `(select auth.uid())` wrapper inside the function body — prevents row-by-row re-evaluation:**

```sql
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id
  FROM org_members
  WHERE profile_id = (SELECT auth.uid())
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '';
```

Key details:
- `SET search_path = ''` — required by Supabase security advisor to prevent search_path injection attacks. Use fully-qualified table names (`public.org_members`) inside the function.
- `STABLE` — tells Postgres the function returns the same result within a transaction; enables caching
- `SECURITY DEFINER` — function runs as definer (no RLS on `org_members`), avoids infinite RLS recursion

**2. Wrap in SELECT in policies for initPlan caching:**

```sql
-- Good: Postgres evaluates user_org_ids() once per statement, caches result
CREATE POLICY "org_members can read org data"
  ON public.client_workspaces
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()));

-- Bad: function called per row
USING (organization_id IN (public.user_org_ids()))
```

**3. For role-gated actions (admin-only), add a second helper:**

```sql
CREATE OR REPLACE FUNCTION public.user_org_role(org_id uuid)
RETURNS text AS $$
  SELECT role
  FROM public.org_members
  WHERE profile_id = (SELECT auth.uid())
    AND organization_id = org_id
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '';
```

Used in policies like:

```sql
-- Only admins can see org invite state, etc.
CREATE POLICY "only org admin"
  ON public.organizations
  FOR UPDATE TO authenticated
  USING ((SELECT public.user_org_role(id)) = 'admin');
```

### Table-by-Table Policy Strategy

| Table | Policy Type | Using Clause |
|-------|-------------|--------------|
| `organizations` | SELECT | `id IN (SELECT public.user_org_ids())` |
| `organizations` | UPDATE/DELETE | `(SELECT public.user_org_role(id)) = 'admin'` |
| `org_members` | SELECT | `organization_id IN (SELECT public.user_org_ids())` |
| `org_members` | INSERT | `organization_id IN (SELECT public.user_org_ids())` AND role check via separate function |
| `org_members` | DELETE | `organization_id IN (SELECT public.user_org_ids())` AND `(SELECT public.user_org_role(organization_id)) = 'admin'` |
| `credit_packages` | SELECT | `organization_id IN (SELECT public.user_org_ids())` |
| `client_workspaces` | SELECT | `organization_id IN (SELECT public.user_org_ids())` |

### Transition Strategy (zero downtime)

During the migration phase, keep old `profile_id`-based policies active AND add new `organization_id`-based policies (OR logic). After verifying all data is migrated and org_members populated, drop the old policies.

```sql
-- Transition policy (both old and new users can read their data)
CREATE POLICY "workspace read transition"
  ON public.client_workspaces FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT auth.uid())  -- old: direct profile ownership
    OR organization_id IN (SELECT public.user_org_ids())  -- new: org membership
  );
```

This avoids any window where authenticated users lose access to their data.

### Revoke public execute on helpers

```sql
-- Prevent unauthenticated enumeration via RPC
REVOKE EXECUTE ON FUNCTION public.user_org_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_org_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_org_role(uuid) TO authenticated;
```

---

## SDK Additions

### No new npm packages required

All required functionality is available in the existing stack:

| Need | How | Package |
|------|-----|---------|
| Admin user creation | `supabaseAdmin.auth.admin.createUser()` | `@supabase/supabase-js` (already installed) |
| Invite link generation | `supabaseAdmin.auth.admin.generateLink()` | same |
| Org role in auth context | Read from `org_members` on login, store in React Context | no new package |
| Role-based UI visibility | React Context + conditional rendering | no new package |
| Password set page | `supabase.auth.updateUser({ password })` after session from URL hash | same |

### Auth Context Extension

The existing `useAuth` hook (in `src/shared/hooks/useAuth.ts`) needs to be extended to fetch and expose `orgRole`:

```typescript
interface AuthContextValue {
  user: User | null
  profile: Profile | null
  // NEW:
  organization: Organization | null
  orgRole: 'admin' | 'member' | 'viewer' | null
}
```

On login, after fetching the profile, do a single join query:

```typescript
const { data } = await supabase
  .from('org_members')
  .select('role, organizations(*)')
  .eq('profile_id', user.id)
  .single()
// Store data.organizations as organization, data.role as orgRole
```

This is a single extra query at login time — not per-render. No new library needed.

### emailCopy.ts: add invite case

Check `supabase/functions/_shared/emailCopy.ts` — if an `"invite"` case is not already present, add:

```typescript
invite: {
  subject: () => "Sie wurden eingeladen — KAMANIN Portal",
  title: "Einladung zum Portal",
  greeting: (name?: string) => name ? `Hallo ${name},` : "Hallo,",
  body: "Sie wurden eingeladen, dem KAMANIN Client Portal beizutreten. Klicken Sie auf den Button, um Ihr Passwort zu setzen und loszulegen.",
  cta: "Passwort setzen & Portal öffnen",
  notes: ["Dieser Link ist 24 Stunden gültig.", "Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren."]
}
```

Note: `auth-email/index.ts` line 16 already lists `"invite"` as a valid `email_action_type`, and line 61 already maps it — but the email copy content needs to exist in `emailCopy.ts`.

---

## What NOT to Add

| Temptation | Why to Avoid |
|------------|--------------|
| `inviteUserByEmail()` | Requires GoTrue SMTP — broken on this instance. Will fail silently or error. Use `createUser` + `generateLink` instead. |
| JWT custom claims for role | Adds complexity (needs claims refresh on role change, custom JWT hook). The `org_members` table query at login is simpler and sufficient for this scale. |
| Multi-org membership | Out of scope per `organizations.md` decisions: "один юзер = одна org". Don't add org-switcher UI or multi-org queries. |
| Org invitation tokens table | Not needed — GoTrue's `generateLink({ type: 'recovery' })` generates a cryptographically secure, expiring token natively. Don't reinvent this. |
| New auth library (NextAuth, Auth.js) | Stack already has GoTrue/Supabase Auth working. No migration needed. |
| Role permissions table | The three roles (admin/member/viewer) are simple enough for inline role checks. A `role_permissions` join table adds complexity without benefit at this scale. Extend to JSONB permissions only if per-module roles are needed (Phase 5+). |
| Resend or other email provider | Mailjet is already integrated and working. Don't add a second email provider. |
| Separate `pending_invitations` table | Not needed with the `createUser` + confirmed approach. The user exists in `auth.users` from the moment of invite. Track invite state via `org_members.invited_at` column if needed. |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| createUser + generateLink flow | HIGH | Verified against Supabase JS SDK reference and community discussions |
| SECURITY DEFINER helper pattern | HIGH | Verified against official Supabase RLS docs and makerkit production patterns |
| initPlan SELECT wrapper | HIGH | Documented in Supabase performance advisor and official RLS guide |
| inviteUserByEmail unsuitability | HIGH | SMTP dependency confirmed; this instance has SMTP broken per PROJECT.md |
| auth-email hook "invite" support | HIGH | Code verified directly in `supabase/functions/auth-email/index.ts` |
| No new npm packages needed | HIGH | All required SDK methods in existing `@supabase/supabase-js` |
| generateLink recovery type for new users | MEDIUM | Pattern well-documented in community; verify `redirect_to` behavior in GoTrue version on Coolify |

---

## Sources

- [Supabase: auth.admin.createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Supabase: auth.admin.generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- [Supabase: RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Makerkit: Supabase RLS Best Practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Mansueli: Allowing users to invite others with Supabase Edge Functions](https://blog.mansueli.com/allowing-users-to-invite-others-with-supabase-edge-functions)
- [Boardshape: RLS for team invite system](https://boardshape.com/engineering/how-to-implement-rls-for-a-team-invite-system-with-supabase)
- [Supabase Discussion: Set password after email invite](https://github.com/orgs/supabase/discussions/20333)
- [Supabase SQL: RLS with SECURITY DEFINER](https://supabase-sql.vercel.app/rls-policies-with-security-definer-function)
