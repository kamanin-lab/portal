import { NavLink } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { InboxIcon, TaskDone01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'

interface Props {
  expanded: boolean
  inboxCount: number
  attentionCount: number
  onNavigate?: () => void
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-cta text-white text-2xs font-bold flex items-center justify-center leading-none ml-auto shrink-0">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function SidebarGlobalNav({ expanded, inboxCount, attentionCount, onNavigate }: Props) {
  return (
    <div className="py-1 flex flex-col gap-0.5">
      <NavLink
        to="/inbox"
        onClick={onNavigate}
        className={({ isActive }) => cn(
          'flex items-center h-10 px-3.5 mx-1.5 rounded-[8px] transition-colors',
          'text-text-sidebar hover:bg-sidebar-hover hover:text-white',
          isActive && 'bg-sidebar-active text-white'
        )}
      >
        <div className="relative shrink-0">
          <HugeiconsIcon icon={InboxIcon} size={20} />
          {!expanded && inboxCount > 0 && (
            <span className="absolute -top-[5px] -right-[5px] min-w-[14px] h-[14px] px-1 rounded-full bg-cta text-white text-3xs font-bold flex items-center justify-center leading-none">
              {inboxCount > 99 ? '99+' : inboxCount}
            </span>
          )}
        </div>
        {expanded && (
          <>
            <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden flex-1">Inbox</span>
            <NavBadge count={inboxCount} />
          </>
        )}
      </NavLink>

      <NavLink
        to="/meine-aufgaben"
        onClick={onNavigate}
        className={({ isActive }) => cn(
          'flex items-center h-10 px-3.5 mx-1.5 rounded-[8px] transition-colors',
          'text-text-sidebar hover:bg-sidebar-hover hover:text-white',
          isActive && 'bg-sidebar-active text-white'
        )}
      >
        <div className="relative shrink-0">
          <HugeiconsIcon icon={TaskDone01Icon} size={20} />
          {!expanded && attentionCount > 0 && (
            <span className="absolute -top-[5px] -right-[5px] min-w-[14px] h-[14px] px-1 rounded-full bg-cta text-white text-3xs font-bold flex items-center justify-center leading-none">
              {attentionCount > 99 ? '99+' : attentionCount}
            </span>
          )}
        </div>
        {expanded && (
          <>
            <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden flex-1">Meine Aufgaben</span>
            <NavBadge count={attentionCount} />
          </>
        )}
      </NavLink>
    </div>
  )
}
