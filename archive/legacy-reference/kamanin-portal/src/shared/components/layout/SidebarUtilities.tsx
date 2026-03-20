import { NavLink } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface Props {
  expanded: boolean
}

export function SidebarUtilities({ expanded }: Props) {
  return (
    <div className="py-1 flex flex-col gap-0.5">
      <NavLink
        to="/hilfe"
        className={({ isActive }) => cn(
          'flex items-center h-10 px-3.5 mx-1.5 rounded-[8px] transition-colors',
          'text-text-sidebar hover:bg-sidebar-hover hover:text-white',
          isActive && 'bg-sidebar-active text-white'
        )}
      >
        <HelpCircle size={18} className="shrink-0" />
        {expanded && (
          <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">Hilfe</span>
        )}
      </NavLink>
    </div>
  )
}
