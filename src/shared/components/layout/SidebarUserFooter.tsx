import { NavLink } from 'react-router-dom'
import type { Profile } from '@/shared/types/common'
import { UserAvatar } from '@/shared/components/common/UserAvatar'

interface Props {
  expanded: boolean
  profile: Profile | null
}

export function SidebarUserFooter({ expanded, profile }: Props) {
  return (
    <NavLink
      to="/konto"
      className="flex items-center h-14 px-3 shrink-0 transition-colors hover:bg-sidebar-hover"
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
  )
}
