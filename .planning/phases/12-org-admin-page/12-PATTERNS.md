# Phase 12: org-admin-page — Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/modules/organisation/pages/OrganisationPage.tsx` | page | request-response | `src/shared/pages/KontoPage.tsx` | exact |
| `src/modules/organisation/components/OrgInfoSection.tsx` | component | request-response | `src/shared/components/konto/ProfileSection.tsx` | exact |
| `src/modules/organisation/components/TeamSection.tsx` | component | CRUD | `src/shared/components/konto/CreditHistorySection.tsx` | role-match |
| `src/modules/organisation/components/InviteMemberDialog.tsx` | component | request-response | `src/modules/tickets/components/NewTicketDialog.tsx` | exact |
| `src/modules/organisation/hooks/useOrgMembers.ts` | hook | CRUD | `src/shared/hooks/useWorkspaces.ts` | exact |
| `src/shared/pages/PasswortSetzenPage.tsx` | page | request-response | `src/shared/pages/LoginPage.tsx` | exact |
| `src/app/routes.tsx` (modification) | config | request-response | `src/app/routes.tsx` | self |
| `src/shared/components/layout/SidebarUtilities.tsx` (modification) | component | request-response | `src/shared/components/layout/SidebarUtilities.tsx` | self |
| `src/shared/components/common/ConfirmDialog.tsx` (reuse) | component | request-response | `src/shared/components/common/ConfirmDialog.tsx` | self |

---

## Pattern Assignments

### `src/modules/organisation/pages/OrganisationPage.tsx` (page, request-response)

**Analog:** `src/shared/pages/KontoPage.tsx`

**Imports pattern** (lines 1-12):
```typescript
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { SomeIcon } from '@hugeicons/core-free-icons'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { useAuth } from '@/shared/hooks/useAuth'
import { SomeSectionComponent } from '../components/SomeSectionComponent'
import { Button } from '@/shared/components/ui/button'
```

**Auth/Guard pattern** (lines 14-16):
```typescript
// KontoPage uses: if (!profile) return null
// OrganisationPage should use: if (!isAdmin) return <Navigate to="/inbox" replace />
const { isAdmin } = useOrg()
if (!isAdmin) return <Navigate to="/inbox" replace />
```

**Core page structure pattern** (lines 14-56):
```typescript
// src/shared/pages/KontoPage.tsx lines 14-56
export function KontoPage() {
  const { profile, signOut } = useAuth()
  if (!profile) return null

  return (
    <ContentContainer width="narrow">
      <div className="p-6 max-[768px]:p-4 flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Konto</h1>
          <p className="mt-1 text-text-secondary text-sm">
            Verwalten Sie Ihr Profil und Ihre Benachrichtigungen.
          </p>
        </div>

        <ProfileSection profile={profile} />
        <EmailSection currentEmail={profile.email} />
        <PasswordSection />
        <NotificationSection preferences={profile.notification_preferences} />
        <CreditHistorySection />
        ...
      </div>
    </ContentContainer>
  )
}
```

**Copy verbatim for OrganisationPage:**
- `<ContentContainer width="narrow">` wrapper
- `<div className="p-6 max-[768px]:p-4 flex flex-col gap-5">` inner wrapper
- `<h1 className="text-xl font-semibold text-text-primary">` page title
- `<p className="mt-1 text-text-secondary text-sm">` subtitle

---

### `src/modules/organisation/components/OrgInfoSection.tsx` (component, request-response)

**Analog:** `src/shared/components/konto/ProfileSection.tsx`

**Section card pattern** (lines 87-125):
```typescript
// src/shared/components/konto/ProfileSection.tsx lines 87-125
export function ProfileSection({ profile }: Props) {
  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <HugeiconsIcon icon={UserIcon} size={18} className="text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">Profil</h2>
      </div>

      <div className="flex flex-col gap-4">
        {/* field rows */}
      </div>
    </section>
  )
}
```

**Read-only field display pattern** (inline within ProfileSection):
```typescript
<div className="flex items-center gap-2">
  <span className="text-sm text-text-primary">{value || 'Nicht angegeben'}</span>
</div>
```

**Copy verbatim for OrgInfoSection:**
- `<section className="bg-surface rounded-[14px] border border-border p-5">` card shell
- Icon + h2 header row: `flex items-center gap-2 mb-4`
- `HugeiconsIcon` with `size={18} className="text-text-secondary"`
- `<h2 className="text-sm font-semibold text-text-primary">` section heading

---

### `src/modules/organisation/components/TeamSection.tsx` (component, CRUD)

**Analog:** `src/shared/components/konto/CreditHistorySection.tsx`

**Section with list rows pattern** (lines 105-168):
```typescript
// src/shared/components/konto/CreditHistorySection.tsx lines 105-168
export function CreditHistorySection() {
  return (
    <section id="guthaben" className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center gap-2 mb-1">
        <HugeiconsIcon icon={FlashIcon} size={18} className={balanceColor} />
        <h2 className="text-base font-semibold text-text-primary">Guthaben</h2>
      </div>
      ...
      {historyLoading ? (
        <div className="py-6 text-center text-sm text-text-tertiary">Laden...</div>
      ) : months.length === 0 ? (
        <div className="py-6 text-center text-sm text-text-tertiary">
          Noch keine Transaktionen vorhanden.
        </div>
      ) : (
        <>
          {months.map(group => (...))}
        </>
      )}
    </section>
  )
}
```

**Row item pattern** (lines 29-81 — `TransactionRow`):
```typescript
// CreditHistorySection.tsx lines 29-81
function TransactionRow({ tx, onTaskClick }) {
  return (
    <div className={cn(
      'flex items-center gap-2 py-2 px-1 rounded-[6px] transition-colors',
      canClick && 'hover:bg-surface-hover cursor-pointer'
    )}>
      {/* avatar/icon  */}
      <span className="flex-1 text-sm text-text-primary truncate">{label}</span>
      {/* badge/action on right */}
      <span className="text-sm font-medium tabular-nums shrink-0">{value}</span>
    </div>
  )
}
```

**Notes for TeamSection:**
- No shadcn Table component is installed — use the row-div pattern from CreditHistorySection above
- Header row of the table should use `text-xs font-semibold text-text-secondary uppercase tracking-wide` (same as `MonthSection` label at line 87)
- Action menu per row: no existing DropdownMenu — use a simple inline button or install `shadcn/ui` Dropdown separately
- Invite button belongs in the section header area alongside the h2 (right-aligned using `flex items-center justify-between`)

---

### `src/modules/organisation/components/InviteMemberDialog.tsx` (component, request-response)

**Analog:** `src/modules/tickets/components/NewTicketDialog.tsx`

**Imports pattern** (lines 1-10):
```typescript
// src/modules/tickets/components/NewTicketDialog.tsx lines 1-10
import { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { HugeiconsIcon } from '@hugeicons/react';
import { MultiplicationSignIcon } from '@hugeicons/core-free-icons';
import { useCreateTask } from '../hooks/useCreateTask';
import { dict } from '../lib/dictionary';
import { Button } from '@/shared/components/ui/button';
```

**Dialog shell pattern** (lines 62-104):
```typescript
// src/modules/tickets/components/NewTicketDialog.tsx lines 62-104
return (
  <Dialog.Root open={open} onOpenChange={v => { if (!v) handleClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 animate-[fadeIn_150ms_ease]" />
      <Dialog.Content
        className="fixed top-0 right-0 h-full w-full max-w-[520px] bg-surface shadow-2xl flex flex-col z-50 focus:outline-none overflow-hidden data-[state=open]:animate-[slideInRight_200ms_ease] data-[state=closed]:animate-[slideOutRight_150ms_ease]"
        aria-describedby={undefined}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <Dialog.Title className="text-md font-semibold text-text-primary">{title}</Dialog.Title>
          <Dialog.Close className="p-1.5 rounded hover:bg-surface-hover transition-colors cursor-pointer">
            <HugeiconsIcon icon={MultiplicationSignIcon} size={18} className="text-text-tertiary" />
          </Dialog.Close>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {/* form fields */}
          </div>
          <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-border shrink-0">
            <Button type="button" onClick={handleClose} disabled={isPending} variant="outline">
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending || !isValid}>
              {isPending ? 'Laden...' : 'Einladen'}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
```

**State + reset + submit pattern** (lines 27-58):
```typescript
// src/modules/tickets/components/NewTicketDialog.tsx lines 27-58
const [subject, setSubject] = useState('');
const { mutateAsync: createTask, isPending } = useCreateTask();

function handleClose() {
  setSubject('');
  onClose();
}

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!subject.trim()) return;
  try {
    await createTask({ name: subject.trim(), ... });
    handleClose();
  } catch { /* error toast handled by mutation hook */ }
}
```

**Note for InviteMemberDialog:** The dialog uses a slide-in panel (right side sheet style). If a centered modal is preferred for invite, use `Dialog.Content` with `className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[420px] bg-surface rounded-[14px] border border-border p-6 shadow-2xl z-50 focus:outline-none"` — both patterns use `* Dialog.Root` from `@radix-ui/react-dialog`.

---

### `src/modules/organisation/hooks/useOrgMembers.ts` (hook, CRUD)

**Analog:** `src/shared/hooks/useWorkspaces.ts`

**Full hook pattern** (lines 1-35):
```typescript
// src/shared/hooks/useWorkspaces.ts lines 1-35
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useOrg } from '@/shared/hooks/useOrg'

export function useWorkspaces() {
  const { organization } = useOrg()

  return useQuery<ClientWorkspace[]>({
    queryKey: ['workspaces', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return []
      const { data, error } = await supabase
        .from('client_workspaces')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) return []
      return data ?? []
    },
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
  })
}
```

**Copy verbatim for useOrgMembers:**
- `import { useQuery } from '@tanstack/react-query'`
- `import { supabase } from '@/shared/lib/supabase'`
- `import { useOrg } from '@/shared/hooks/useOrg'`
- `queryKey: ['org-members', organization?.id]` (adjust key)
- `enabled: !!organization?.id` guard
- `staleTime: 5 * 60 * 1000`
- `if (error) return []` silent error handling in queryFn
- Table name: `org_members`, join to `profiles` for display fields

**Mutation pattern for remove/role-change** — copy from `src/modules/tickets/hooks/useCreateTask.ts` lines 33-55:
```typescript
// useCreateTask.ts lines 33-55
return useMutation({
  mutationFn: async (input) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    const { data, error } = await supabase.functions.invoke('edge-function-name', { body: input });
    if (error) throw new Error(error.message);
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['org-members'] });
    toast.success('Mitglied entfernt.');
  },
  onError: (error: Error) => {
    toast.error('Fehler', { description: error.message });
  },
});
```

---

### `src/shared/pages/PasswortSetzenPage.tsx` (page, request-response)

**Analog:** `src/shared/pages/LoginPage.tsx`

**Full page shell pattern** (lines 63-182):
```typescript
// src/shared/pages/LoginPage.tsx lines 63-182
return (
  <div className="min-h-screen bg-bg flex items-center justify-center p-4">
    <div className="w-full max-w-[400px]">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <img src={logo} alt="KAMANIN" className="h-14 w-auto mb-3" />
        <p className="text-text-tertiary text-sm">Ihr Projektportal</p>
      </div>

      {/* Card */}
      <div className="bg-surface rounded-[14px] border border-border p-6 shadow-md">
        <h2 className="text-base font-semibold text-text-primary mb-5">Anmelden</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary" htmlFor="email">
              E-Mail-Adresse
            </label>
            <input
              id="email"
              type="email"
              className="h-10 px-3 rounded-[8px] border border-border bg-bg text-text-primary text-sm outline-none focus:border-accent transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-awaiting bg-awaiting-bg px-3 py-2 rounded-[8px]">{error}</p>
          )}
          {successMsg && (
            <p className="text-xs text-committed bg-committed-bg px-3 py-2 rounded-[8px]">{successMsg}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="h-10 rounded-[8px] bg-accent text-white text-sm font-semibold transition-colors hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Bitte warten…' : 'Passwort festlegen'}
          </button>
        </form>
      </div>
    </div>
  </div>
)
```

**Import for logo:**
```typescript
import logo from '@/assets/KAMANIN-icon-colour.svg'
```

**Auth interaction pattern** (lines 29-61):
```typescript
// LoginPage.tsx lines 29-61 — adapt for updateUser call:
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault()
  setError(null)
  setIsLoading(true)
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setError('Passwort konnte nicht gesetzt werden. Bitte erneut versuchen.')
    } else {
      setSuccessMsg('Passwort erfolgreich gesetzt.')
      navigate('/inbox', { replace: true })
    }
  } finally {
    setIsLoading(false)
  }
}
```

**Note:** PasswortSetzenPage must be outside `<ProtectedRoute>` — place it as a sibling to `/login` in routes.tsx. It receives a Supabase recovery token from the URL (Supabase handles session hydration on page load via `supabase.auth.onAuthStateChange`).

---

### Route additions to `src/app/routes.tsx` (modification)

**Analog:** `src/app/routes.tsx` (self)

**Lazy import pattern** (lines 9-19):
```typescript
// src/app/routes.tsx lines 9-19
const KontoPage = lazy(() => import('@/shared/pages/KontoPage').then(m => ({ default: m.KontoPage })))
```

**Protected route addition pattern** (lines 39-61):
```typescript
// Place inside <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
<Route path="/organisation" element={withRouteLoading(<OrganisationPage />)} />
```

**Public route addition pattern** (lines 37-38):
```typescript
// Place as sibling to /login — outside ProtectedRoute:
<Route path="/passwort-setzen" element={withRouteLoading(<PasswortSetzenPage />)} />
```

**Note:** `/organisation` does NOT need `WorkspaceGuard` — it is an org-level admin page, not workspace-scoped. Admin guard is handled inside `OrganisationPage` itself via `useOrg().isAdmin`.

---

### Sidebar Utilities zone in `src/shared/components/layout/SidebarUtilities.tsx` (modification)

**Analog:** `src/shared/components/layout/SidebarUtilities.tsx` (self)

**NavLink entry pattern** (lines 38-51):
```typescript
// src/shared/components/layout/SidebarUtilities.tsx lines 38-51
<NavLink
  to="/hilfe"
  onClick={onNavigate}
  className={({ isActive }) => cn(
    'flex items-center h-10 px-3.5 mx-1.5 rounded-[8px] transition-colors',
    'text-text-sidebar hover:bg-sidebar-hover hover:text-white',
    isActive && 'bg-sidebar-active text-white'
  )}
>
  <HugeiconsIcon icon={HelpCircleIcon} size={20} className="shrink-0" />
  {expanded && (
    <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">FAQ</span>
  )}
</NavLink>
```

**Copy verbatim for /organisation link:**
- Same `NavLink` structure, same className pattern
- Icon: use `Building04Icon` or `UserGroup02Icon` from `@hugeicons/core-free-icons`
- Label: `"Organisation"`
- Conditional render: only show when `isAdmin` — wrap the `NavLink` in `{isAdmin && (...)}` using `useOrg()` inside `SidebarUtilities`

---

### `src/shared/components/common/ConfirmDialog.tsx` (reuse for member removal)

**This component is already built** — no new code needed. Reuse as-is.

**Usage pattern** (full file, lines 1-58):
```typescript
// src/shared/components/common/ConfirmDialog.tsx
import { ConfirmDialog } from '@/shared/components/common/ConfirmDialog'

// In TeamSection, manage state:
const [removeTarget, setRemoveTarget] = useState<string | null>(null)

// Render:
<ConfirmDialog
  open={!!removeTarget}
  title="Mitglied entfernen"
  message="Möchten Sie dieses Mitglied wirklich aus der Organisation entfernen?"
  confirmLabel="Entfernen"
  cancelLabel="Abbrechen"
  onConfirm={() => { removeMember(removeTarget!); setRemoveTarget(null) }}
  onCancel={() => setRemoveTarget(null)}
  destructive={true}
/>
```

---

## Shared Patterns

### Admin guard
**Source:** `src/shared/hooks/useOrg.ts` (lines 6-16)
**Apply to:** `OrganisationPage`, `SidebarUtilities` (conditional link visibility)
```typescript
// useOrg.ts lines 6-16
export type OrgRole = 'admin' | 'member' | 'viewer'
export interface OrgContextValue {
  organization: Organization | null
  orgRole: OrgRole
  isAdmin: boolean
  isMember: boolean
  isViewer: boolean
  isLoading: boolean
}
// Usage:
const { isAdmin, isLoading } = useOrg()
if (isLoading) return null
if (!isAdmin) return <Navigate to="/inbox" replace />
```

### Toast error/success pattern
**Source:** `src/modules/tickets/hooks/useCreateTask.ts` (lines 98-107)
**Apply to:** `useOrgMembers` mutations, `InviteMemberDialog` submit handler
```typescript
import { toast } from 'sonner'
// success:
toast.success('Einladung gesendet.', { description: `${email} wurde eingeladen.` })
// error:
toast.error('Verbindungsfehler.', { description: error.message })
```

### Edge Function invocation pattern
**Source:** `src/modules/tickets/hooks/useCreateTask.ts` (lines 39-55)
**Apply to:** `useOrgMembers` (invite mutation, remove mutation)
```typescript
const { data: { session } } = await supabase.auth.getSession()
if (!session) throw new Error('Not authenticated')
const { data, error } = await supabase.functions.invoke('function-name', { body: payload })
if (error) throw new Error(error.message || 'Failed')
if (!data?.success) throw new Error(data?.error || 'Failed')
return data
```

### Section card shell
**Source:** `src/shared/components/konto/ProfileSection.tsx` (line 88)
**Apply to:** `OrgInfoSection`, `TeamSection`
```typescript
<section className="bg-surface rounded-[14px] border border-border p-5">
  <div className="flex items-center gap-2 mb-4">
    <HugeiconsIcon icon={SomeIcon} size={18} className="text-text-secondary" />
    <h2 className="text-sm font-semibold text-text-primary">Section Title</h2>
  </div>
  {/* content */}
</section>
```

### ContentContainer page wrapper
**Source:** `src/shared/pages/KontoPage.tsx` (lines 27-29)
**Apply to:** `OrganisationPage`
```typescript
<ContentContainer width="narrow">
  <div className="p-6 max-[768px]:p-4 flex flex-col gap-5">
    {/* sections */}
  </div>
</ContentContainer>
```

### Lazy route loading
**Source:** `src/app/routes.tsx` (lines 9-31)
**Apply to:** new route entries for `OrganisationPage` and `PasswortSetzenPage`
```typescript
const OrganisationPage = lazy(() => import('@/modules/organisation/pages/OrganisationPage').then(m => ({ default: m.OrganisationPage })))
const PasswortSetzenPage = lazy(() => import('@/shared/pages/PasswortSetzenPage').then(m => ({ default: m.PasswortSetzenPage })))
```

---

## No Analog Found

All files have close analogs. The following are first-of-kind patterns in the codebase — planner should use RESEARCH.md or Edge Function contracts:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| DropdownMenu (action menu per row) | component | request-response | No shadcn DropdownMenu installed yet — will need `npx shadcn@latest add dropdown-menu` |

---

## Metadata

**Analog search scope:** `src/app/`, `src/shared/`, `src/modules/tickets/`, `src/shared/components/`
**Files scanned:** 18 source files read directly
**Pattern extraction date:** 2026-04-15
