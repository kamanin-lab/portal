import { NavLink } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { HelpCircleIcon, Settings02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'
import { CreditBalance } from '@/modules/tickets/components/CreditBalance'

interface Props {
  expanded: boolean
  onNavigate?: () => void
}

export function SidebarUtilities({ expanded, onNavigate }: Props) {
  return (
    <div className="py-1 flex flex-col gap-0.5">
      <CreditBalance compact={!expanded} />
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
          <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">Hilfe</span>
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
