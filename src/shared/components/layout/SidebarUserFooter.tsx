import type { Profile } from '@/shared/types/common'

interface Props {
  expanded: boolean
  profile: Profile | null
}

export function SidebarUserFooter({ expanded, profile }: Props) {
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex items-center h-14 px-3 shrink-0">
      <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0">
        <span className="text-white text-xs font-semibold">{initials}</span>
      </div>
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
    </div>
  )
}
