import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserMultipleIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { useOrgMembers, type OrgMember } from '../hooks/useOrgMembers'
import { InviteMemberDialog } from './InviteMemberDialog'
import { MemberRowActions } from './MemberRowActions'
import { MemberDepartmentPicker } from './MemberDepartmentPicker'

const ROLE_LABELS: Record<OrgMember['role'], string> = {
  admin: 'Administrator',
  member: 'Mitglied',
  viewer: 'Betrachter',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

function displayName(
  profile: OrgMember['profile'],
  invitedEmail: string | null,
): string {
  if (profile?.full_name) return profile.full_name
  if (invitedEmail) return invitedEmail.split('@')[0]
  return '—'
}

export function TeamSection() {
  const { data: members = [], isLoading } = useOrgMembers()
  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <section className="bg-surface rounded-[14px] border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={UserMultipleIcon} size={18} className="text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-primary">Team</h2>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <HugeiconsIcon icon={PlusSignIcon} size={14} className="mr-1" />
          Mitglied einladen
        </Button>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-sm text-text-tertiary">Lädt...</div>
      ) : members.length === 0 ? (
        <div className="py-6 text-center text-sm text-text-tertiary">Noch keine Mitglieder vorhanden.</div>
      ) : (
        <>
          {/* Desktop table (md+) */}
          <div className="hidden md:flex flex-col">
            <div className="grid grid-cols-[1.2fr_1.5fr_120px_180px_100px_40px] gap-3 px-2 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide border-b border-border">
              <span>Name</span>
              <span>E-Mail</span>
              <span>Rolle</span>
              <span>Fachbereich</span>
              <span>Hinzugefügt</span>
              <span></span>
            </div>
            {members.map(m => {
              const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
              const isPending = !m.accepted_at
              const name = displayName(profile, m.invited_email)
              return (
                <div key={m.id} className="grid grid-cols-[1.2fr_1.5fr_120px_180px_100px_40px] gap-3 px-2 py-2 items-center border-b border-border/50 last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-text-primary truncate min-w-0">{name}</span>
                    {isPending && <Badge variant="attention" className="shrink-0">Einladung ausstehend</Badge>}
                  </div>
                  <span className="text-sm text-text-secondary truncate">{profile?.email ?? m.invited_email ?? '—'}</span>
                  <span className="text-sm text-text-primary">{ROLE_LABELS[m.role]}</span>
                  <div className="min-w-0">
                    <MemberDepartmentPicker memberId={m.id} memberDepartments={m.departments ?? []} />
                  </div>
                  <span className="text-sm text-text-tertiary tabular-nums">{formatDate(m.created_at)}</span>
                  <MemberRowActions member={m} members={members} />
                </div>
              )
            })}
          </div>

          {/* Mobile cards (< md) */}
          <div className="flex md:hidden flex-col divide-y divide-border/50">
            {members.map(m => {
              const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
              const isPending = !m.accepted_at
              const name = displayName(profile, m.invited_email)
              return (
                <div key={m.id} className="flex items-start justify-between gap-2 py-3 px-1">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-text-primary truncate min-w-0">{name}</span>
                      {isPending && <Badge variant="attention" className="shrink-0">Einladung ausstehend</Badge>}
                    </div>
                    <span className="text-xs text-text-secondary truncate">{profile?.email ?? m.invited_email ?? '—'}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-text-tertiary">{ROLE_LABELS[m.role]}</span>
                      <span className="text-text-tertiary/40 text-xs">·</span>
                      <span className="text-xs text-text-tertiary tabular-nums">{formatDate(m.created_at)}</span>
                    </div>
                    <div className="mt-1">
                      <MemberDepartmentPicker memberId={m.id} memberDepartments={m.departments ?? []} />
                    </div>
                  </div>
                  <MemberRowActions member={m} members={members} />
                </div>
              )
            })}
          </div>
        </>
      )}

      <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </section>
  )
}
