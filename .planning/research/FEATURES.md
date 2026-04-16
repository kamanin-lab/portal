# Feature Landscape: Multi-User Organisation Support

**Domain:** B2B client portal — multi-user org management, RBAC, member invites
**Researched:** 2026-04-14
**Context:** Adding organisation layer to existing single-user-per-client portal (KAMANIN IT Solutions)

---

## Summary

B2B SaaS organisation features divide cleanly into two tiers for a small-team (2–5 users) context. The first tier — member invite, role assignment, team list, role-based UI hiding — is table stakes: users who need to add colleagues to a shared workspace expect these to just work. The second tier — audit logs, granular permission editors, multi-org membership, SSO — is enterprise scope; it does not belong in v2.0 and actively creates complexity that will slow the implementation down without delivering value to current clients (MBM, Summerfield).

The existing KAMANIN architecture (Supabase RLS, `profile_id` scoping, GoTrue auth) constrains the invite flow in one specific way: magic links are disabled. This means the Supabase `inviteUserByEmail()` → set-password pattern is the correct path. It is well-supported, requires a custom `/set-password` page, and handles the access token as a URL hash fragment on the client side. This is the only invite flow that does not require re-enabling magic links.

The 3-role model (admin / member / viewer) is the canonical starting point for B2B SaaS teams at this scale. Industry evidence (Slack, GitHub, Linear, Notion) shows that 3–5 roles cover 90% of use cases before enterprise requirements emerge. For KAMANIN's context specifically, the viewer role is the critical differentiator: firm owners want to show project status to board members or external stakeholders without giving them write access.

---

## Table Stakes

Features users expect in any B2B portal that supports multiple users per company. Missing any of these makes the org feature feel unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Team list on /organisation | See who has access; trust signal | Low | Name, email, role, date joined |
| Invite member by email | Standard org onboarding flow | Medium | Sends invite email → set-password page |
| Role assignment at invite time | Users pick role when inviting, not after | Low | Dropdown: Member / Viewer (admin stays admin) |
| Role change after invite | Promote viewer to member, demote member to viewer | Low | Cannot demote self; cannot demote last admin |
| Remove member from org | Offboarding when employee leaves | Low | Soft-delete preferred (audit trail) or hard delete |
| Role-based UI hiding | Viewers don't see create/approve buttons | Medium | Hide at component level; RLS enforces at data level |
| Org-scoped shared credits | Credits belong to org, not individual profile | High | Requires DB migration (credit_packages → organization_id) |
| Org-scoped workspaces | All members see the same sidebar workspaces | Medium | client_workspaces FK migrates to organization_id |
| Org-scoped files | All members browse the same Nextcloud root | Low | nextcloud_client_root migrates to organizations table |
| Org-scoped support chat | One support thread per company, not per user | Medium | support_task_id + clickup_chat_channel_id → organizations |
| Pending invite state | Invitee shows as "Einladung ausstehend" until accepted | Low | Supabase user record exists but has no password set yet |
| Self-serve leave org (member/viewer) | Members can remove themselves | Low | Redirect to logout after self-removal |

---

## Differentiators

Features that add real value for this specific context (small web agency → small client team) but are not universally expected.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Viewer role (read-only) | Firm owner can add board observer or external stakeholder without granting write access | Low | UI guards only; RLS already restricts mutations by checking action, not role — add role check |
| Last-admin guard | Prevents org from becoming admin-less (locked out state) | Low | Check count before allowing last admin role change or removal |
| Invite re-send | Resend invite email if original expired or lost | Low | Call inviteUserByEmail() again; Supabase overwrites pending invite |
| Org info display on /organisation | Shows org name, credit balance, package details in one place | Low | Combines OrgInfoSection + TeamSection on single page |
| Onboarding script support | `onboard-client.ts` creates org + admin + optional initial members in one command | Medium | Already planned; reduces manual setup for new clients |

---

## Anti-Features

Features to explicitly NOT build in this milestone. Each has a reason and an alternative.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Multiple org membership per user | Adds org-switcher UI complexity; no real need for 2-person web agency clients | One user = one org. If needed later, add org_switcher as separate milestone |
| Granular per-permission editor | Premature. 3 roles cover 100% of current use cases; custom permissions belong in enterprise tier | Expose roles in UI, check permissions in code (map role → permission set internally) |
| Billing admin as separate role | Over-engineering; admin = billing contact by design decision (already validated 2026-03-27) | Keep admin as billing contact |
| SSO / domain-based auto-join | No client has SSO; adds auth infrastructure complexity for zero current benefit | Password-based invite flow is sufficient |
| Audit log / activity history | Useful eventually but no client has asked for it; adds table + query overhead | Log to existing notifications or defer to admin dashboard milestone |
| Per-module role overrides | "viewer in Tickets, admin in Projects" — complex JSONB role model; no current need | Flat role applies across all modules. Document extension path in DECISIONS.md |
| Org creation UI | Only KAMANIN creates orgs (via onboard-client.ts); clients never need this | No /organisation/new page; org created during offboarding script |
| Member-initiated invite | Security model: only admin can invite. Avoids accidental org membership leaks | Guard InviteMemberDialog behind admin-only check |

---

## Invite UX Patterns

### Constraint: Magic Links Disabled

GoTrue SMTP is not working in the self-hosted setup. Magic links (`signInWithOtp`) are disabled. The correct pattern is:

**Pattern: Admin-triggered invite → Supabase `inviteUserByEmail()` → Custom `/passwort-setzen` page**

Flow:
1. Admin opens InviteMemberDialog on /organisation
2. Admin enters email, selects role (Member / Viewer), clicks "Einladen"
3. Edge Function calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '/passwort-setzen' })`
4. Supabase creates unconfirmed user, sends invite email with `{{ .ConfirmationURL }}`
5. Invitee clicks link in email → redirected to `/passwort-setzen?access_token=...#access_token=...`
6. `/passwort-setzen` page reads `access_token` from URL hash (client-side only — hash never leaves browser)
7. Page calls `supabase.auth.setSession({ access_token, refresh_token })` then `supabase.auth.updateUser({ password })`
8. On success: create `org_members` record (organization_id + profile_id + role) if not already created by the invite step
9. Redirect to /tickets (first meaningful page)

**Implementation notes:**
- `access_token` is in URL hash fragment (`#`), not query string — cannot be read server-side
- Build a minimal custom `/passwort-setzen` page (not the Supabase Auth UI `update_password` view — it has session timing issues in invite flow)
- Pending invite state: user exists in `auth.users` but `org_members` row may not exist yet — handle in the set-password success handler
- Resend invite: call `inviteUserByEmail()` again with same email — Supabase overwrites the pending token
- Invite expiry: Supabase default is 24h for invite links; document this in the UI ("Link ist 24 Stunden gültig")

**Email copy (German, matches portal tone):**
- Subject: `[Org name] hat Sie zum KAMANIN Portal eingeladen`
- Body: Brief explanation of what the portal is, CTA button "Passwort festlegen", 24h validity note
- Use existing `emailCopy.ts` + `send-mailjet-email` Edge Function pattern — do NOT rely on GoTrue default email

**Alternative considered: Admin sets password for new user**
Admin enters email + temporary password, invitee logs in and changes it. This is simpler technically but violates the principle that only the user should know their password. Rejected. The invite-link pattern is standard and respects user privacy.

**Alternative considered: Invite code**
Show a one-time code that admin shares manually (Slack DM etc). Lower friction for the admin but worse security and no email audit trail. Rejected for production use. Could be an emergency fallback if invite email delivery fails.

---

## Role Matrix Notes

The role model is already validated in `docs/ideas/organizations.md`. Key clarifications for implementation:

### Enforcement layers (both required)

- **Frontend guards:** Conditional rendering hides buttons/sections based on `orgRole` from auth context. Viewers never see "Neue Aufgabe", "Freigeben", "Änderungen anfordern", "Kosten freigeben" buttons. Members never see InviteMemberDialog or credit package management.
- **RLS / Edge Function guards:** Backend validates role for write operations. A viewer with modified frontend cannot submit mutations. Check `org_members.role` in Edge Functions that perform mutations (create-clickup-task, update-task-status, credit-topup).

### Role check implementation pattern

Check permissions in code, not raw roles. Define a minimal permission map internally:

```typescript
const PERMISSIONS = {
  canCreateTask: ['admin', 'member'],
  canApproveTask: ['admin', 'member'],
  canApproveCredit: ['admin', 'member'],
  canComment: ['admin', 'member', 'viewer'],
  canViewFiles: ['admin', 'member', 'viewer'],
  canUploadFiles: ['admin', 'member'],
  canInviteMembers: ['admin'],
  canManageCreditPackage: ['admin'],
  canManageTeam: ['admin'],
} as const

export function hasPermission(role: OrgRole, action: keyof typeof PERMISSIONS) {
  return PERMISSIONS[action].includes(role)
}
```

This pattern means adding a future role (e.g., `billing_admin`) only requires updating the PERMISSIONS map, not hunting for scattered `role === 'admin'` checks across components.

### Critical guards

| Guard | Where to enforce | Why critical |
|-------|-----------------|--------------|
| Last admin protection | UI + Edge Function | If last admin is removed or demoted, org becomes unmanageable |
| Self-role-change | UI only | Admin cannot demote themselves (UX protection, not security) |
| Viewer on mutations | RLS + Edge Function | Defense in depth; frontend guard alone is insufficient |
| Org membership on data access | RLS via `user_org_ids()` | Core isolation; org members only see their org's data |

### Notification behaviour per role

All roles receive bell notifications and emails for events relevant to them (task updates, comments, approvals). No role silencing. Viewers receive read-only notifications — they cannot act on them but can observe status. This is correct UX: a board observer should know when a project milestone is approved.

---

## Sources

- [Guide to RBAC for B2B SaaS — PropelAuth](https://www.propelauth.com/post/guide-to-rbac-for-b2b-saas) — MEDIUM confidence (verified against internal architecture)
- [Model your B2B SaaS with organizations — WorkOS](https://workos.com/blog/model-your-b2b-saas-with-organizations) — MEDIUM confidence
- [Set password after email invite — Supabase GitHub Discussion #20333](https://github.com/orgs/supabase/discussions/20333) — HIGH confidence (official Supabase community, implementation-verified pattern)
- [Supabase inviteUserByEmail docs](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) — HIGH confidence (official docs)
- [What link to use in Invite user email template — Supabase Discussion #21097](https://github.com/orgs/supabase/discussions/21097) — HIGH confidence (confirms ConfirmationURL + hash token pattern)
- [How to design multi-tenant RBAC — WorkOS](https://workos.com/blog/how-to-design-multi-tenant-rbac-saas) — MEDIUM confidence
- Internal: `docs/ideas/organizations.md` — decisions validated 2026-03-27
- Internal: `.planning/PROJECT.md` — constraints (magic links disabled, GoTrue SMTP broken)
