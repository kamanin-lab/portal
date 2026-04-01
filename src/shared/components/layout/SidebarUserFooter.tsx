import { NavLink } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Logout03Icon } from '@hugeicons/core-free-icons'
import type { Profile } from '@/shared/types/common'
import { UserAvatar } from '@/shared/components/common/UserAvatar'
import { useAuth } from '@/shared/hooks/useAuth'

interface Props {
  expanded: boolean
  profile: Profile | null
  onNavigate?: () => void
}

export function SidebarUserFooter({ expanded, profile, onNavigate }: Props) {
  const { signOut } = useAuth()

  return (
    <div className="flex items-center h-14 px-3 shrink-0 hover:bg-sidebar-hover transition-colors">
      <NavLink
        to="/konto"
        onClick={onNavigate}
        className="flex items-center flex-1 min-w-0"
      >
        <UserAvatar
          name={profile?.full_name ?? null}
          avatarUrl={profile?.avatar_url}
          size="sm"
        />
        {expanded && (
          <div className="ml-2.5 overflow-hidden">
            <p className="text-white text-xs font-medium truncate">
              {profile?.full_name ?? profile?.email}
            </p>
            <p className="text-text-sidebar text-xs truncate">
              {profile?.company_name ?? 'Kunde'}
            </p>
          </div>
        )}
      </NavLink>
      {expanded && (
        <button
          onClick={signOut}
          className="shrink-0 ml-2 p-1.5 text-text-sidebar hover:text-white transition-colors rounded-[6px]"
          title="Abmelden"
        >
          <HugeiconsIcon icon={Logout03Icon} size={16} />
        </button>
      )}
    </div>
  )
}
