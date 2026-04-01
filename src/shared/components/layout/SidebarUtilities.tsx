import { NavLink } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { HelpCircleIcon, Settings02Icon, CustomerServiceIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'
import { CreditBalance } from '@/modules/tickets/components/CreditBalance'

interface Props {
  expanded: boolean
  supportUnread?: number
  onNavigate?: () => void
}

export function SidebarUtilities({ expanded, supportUnread = 0, onNavigate }: Props) {
  return (
    <div className="py-1 flex flex-col gap-0.5">
      <CreditBalance compact={!expanded} />
      <NavLink
        to="/support"
        onClick={onNavigate}
        className={({ isActive }) => cn(
          'flex items-center h-10 px-3.5 mx-1.5 rounded-[8px] transition-colors',
          'text-text-sidebar hover:bg-sidebar-hover hover:text-white',
          isActive && 'bg-sidebar-active text-white'
        )}
      >
        <HugeiconsIcon icon={CustomerServiceIcon} size={20} className="shrink-0" />
        {expanded && (
          <>
            <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden flex-1">Support</span>
            {supportUnread > 0 && (
              <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-cta text-white text-2xs font-bold flex items-center justify-center leading-none shrink-0">
                {supportUnread > 99 ? '99+' : supportUnread}
              </span>
            )}
          </>
        )}
      </NavLink>
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
      <NavLink
        to="/konto"
        onClick={onNavigate}
        className={({ isActive }) => cn(
          'flex items-center h-10 px-3.5 mx-1.5 rounded-[8px] transition-colors',
          'text-text-sidebar hover:bg-sidebar-hover hover:text-white',
          isActive && 'bg-sidebar-active text-white'
        )}
      >
        <HugeiconsIcon icon={Settings02Icon} size={20} className="shrink-0" />
        {expanded && (
          <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">Konto</span>
        )}
      </NavLink>
    </div>
  )
}
