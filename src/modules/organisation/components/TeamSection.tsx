import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserMultipleIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/shared/components/ui/button'
import { useOrgMembers, type OrgMember } from '../hooks/useOrgMembers'
import { InviteMemberDialog } from './InviteMemberDialog'
import { MemberRowActions } from './MemberRowActions'

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
        <div className="flex flex-col">
          <div className="grid grid-cols-[1fr_1fr_120px_100px_40px] gap-3 px-2 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide border-b border-border">
            <span>Name</span>
            <span>E-Mail</span>
            <span>Rolle</span>
            <span>Hinzugefügt</span>
            <span></span>
          </div>
          {members.map(m => {
            const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile
            const isPending = !profile?.full_name
            return (
              <div key={m.id} className="grid grid-cols-[1fr_1fr_120px_100px_40px] gap-3 px-2 py-2 items-center border-b border-border/50 last:border-b-0">
                <span className="text-sm text-text-primary truncate">
                  {isPending ? <em className="text-text-tertiary">Einladung ausstehend</em> : profile?.full_name}
                </span>
                <span className="text-sm text-text-secondary truncate">{profile?.email ?? m.invited_email ?? '—'}</span>
                <span className="text-sm text-text-primary">{ROLE_LABELS[m.role]}</span>
                <span className="text-sm text-text-tertiary tabular-nums">{formatDate(m.created_at)}</span>
                <MemberRowActions member={m} members={members} />
              </div>
            )
          })}
        </div>
      )}

      <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </section>
  )
}
