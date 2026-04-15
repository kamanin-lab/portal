import { NavLink, useLocation } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { InboxIcon, ClipboardIcon, BubbleChatIcon, FolderOpenIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'
import { useAuth } from '@/shared/hooks/useAuth'
import { useOrg } from '@/shared/hooks/useOrg'
import { useUnreadCounts } from '@/modules/tickets/hooks/useUnreadCounts'
import { useNotifications } from '@/modules/tickets/hooks/useNotifications'

export function BottomNav() {
  const location = useLocation()
  const { profile } = useAuth()
  const { organization } = useOrg()
  const { supportUnread } = useUnreadCounts(profile?.id, organization?.support_task_id ?? null)
  const { notifications } = useNotifications(profile?.id)

  const inboxUnread = notifications.filter(
    n => !n.is_read && (!organization?.support_task_id || n.task_id !== organization.support_task_id)
  ).length

  const items: { to: string; icon: IconSvgElement; label: string; badge: number }[] = [
    { to: '/inbox',   icon: InboxIcon,            label: 'Inbox',   badge: inboxUnread },
    { to: '/tickets', icon: ClipboardIcon,         label: 'Aufgaben', badge: 0 },
    { to: '/support', icon: BubbleChatIcon,          label: 'Support',  badge: supportUnread },
    { to: '/dateien', icon: FolderOpenIcon,        label: 'Dateien', badge: 0 },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-[64px] bg-surface border-t border-border flex md:hidden">
      {items.map(({ to, icon, label, badge }) => {
        const active = location.pathname.startsWith(to)
        return (
          <NavLink
            key={to}
            to={to}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 text-xs transition-colors',
              active ? 'text-accent' : 'text-text-tertiary'
            )}
          >
            <div className="relative">
              <HugeiconsIcon icon={icon} size={20} />
              {badge > 0 && (
                <span className="absolute -top-[4px] -right-[6px] min-w-[14px] h-[14px] px-1 rounded-full bg-cta text-white text-3xs font-bold flex items-center justify-center leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </div>
            <span className="text-2xs font-medium">{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
