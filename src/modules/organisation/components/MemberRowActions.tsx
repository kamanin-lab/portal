import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { HugeiconsIcon } from '@hugeicons/react'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { useAuth } from '@/shared/hooks/useAuth'
import { ConfirmDialog } from '@/shared/components/common/ConfirmDialog'
import { useMemberActions } from '../hooks/useMemberActions'
import type { OrgMember } from '../hooks/useOrgMembers'

interface Props {
  member: OrgMember
  members: OrgMember[]
}

export function MemberRowActions({ member, members }: Props) {
  const { user } = useAuth()
  const { changeRole, removeMember } = useMemberActions({ members, currentUserId: user?.id })
  const [removeOpen, setRemoveOpen] = useState(false)

  // Hide actions for current user row (self-protection at UI level)
  if (member.profile_id === user?.id) return null

  type OrgRole = 'admin' | 'member' | 'viewer'
  const roleOptions: { value: OrgRole; label: string }[] = [
    { value: 'admin', label: 'Administrator' },
    { value: 'member', label: 'Mitglied' },
    { value: 'viewer', label: 'Betrachter' },
  ]
  const otherRoles = roleOptions.filter(r => r.value !== member.role)

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            aria-label="Aktionen"
            className="p-1.5 rounded hover:bg-surface-hover transition-colors"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} size={16} className="text-text-tertiary" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="min-w-[180px] bg-surface rounded-[10px] border border-border shadow-lg py-1 z-50"
          >
            {otherRoles.map(r => (
              <DropdownMenu.Item
                key={r.value}
                onSelect={() => { changeRole({ memberId: member.id, nextRole: r.value }).catch(() => {}) }}
                className="px-3 py-2 text-sm text-text-primary hover:bg-surface-hover cursor-pointer outline-none"
              >
                Zu {r.label} ändern
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item
              onSelect={() => setRemoveOpen(true)}
              className="px-3 py-2 text-sm text-awaiting hover:bg-surface-hover cursor-pointer outline-none"
            >
              Entfernen
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmDialog
        open={removeOpen}
        title="Mitglied entfernen"
        message={`Möchten Sie ${(Array.isArray(member.profile) ? member.profile[0] : member.profile)?.full_name ?? (Array.isArray(member.profile) ? member.profile[0] : member.profile)?.email ?? 'dieses Mitglied'} wirklich aus der Organisation entfernen?`}
        confirmLabel="Entfernen"
        cancelLabel="Abbrechen"
        destructive={true}
        onConfirm={() => {
          removeMember({ memberId: member.id }).catch(() => {})
          setRemoveOpen(false)
        }}
        onCancel={() => setRemoveOpen(false)}
      />
    </>
  )
}
