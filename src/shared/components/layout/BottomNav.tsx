import { NavLink, useLocation } from 'react-router-dom'
import { Inbox, ClipboardList, Headset, MoreHorizontal } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useAuth } from '@/shared/hooks/useAuth'
import { useUnreadCounts } from '@/modules/tickets/hooks/useUnreadCounts'
import { useNotifications } from '@/modules/tickets/hooks/useNotifications'

export function BottomNav() {
  const location = useLocation()
  const { profile } = useAuth()
  const { supportUnread } = useUnreadCounts(profile?.id)
  const { notifications } = useNotifications(profile?.id)

  const inboxUnread = notifications.filter(
    n => !n.is_read && (!profile?.support_task_id || n.task_id !== profile.support_task_id)
  ).length

  const items = [
    { to: '/inbox',   icon: Inbox,         label: 'Inbox',   badge: inboxUnread },
    { to: '/tickets', icon: ClipboardList, label: 'Aufgaben', badge: 0 },
    { to: '/support', icon: Headset,       label: 'Support',  badge: supportUnread },
    { to: '/hilfe',   icon: MoreHorizontal, label: 'Mehr',    badge: 0 },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-[64px] bg-surface border-t border-border flex md:hidden">
      {items.map(({ to, icon: Icon, label, badge }) => {
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
              <Icon size={20} />
              {badge > 0 && (
                <span className="absolute -top-[4px] -right-[6px] min-w-[14px] h-[14px] px-[3px] rounded-full bg-cta text-white text-[8px] font-bold flex items-center justify-center leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
