import { NavLink } from 'react-router-dom'
import { Inbox, ClipboardCheck, ClipboardList, HelpCircle, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useAuth } from '@/shared/hooks/useAuth'
import { useWorkspaces } from '@/shared/hooks/useWorkspaces'
import { useNotifications } from '@/modules/tickets/hooks/useNotifications'
import { WORKSPACE_ROUTES } from '@/shared/lib/workspace-routes'

interface Props {
  open: boolean
  onClose: () => void
}

export function MobileSidebarOverlay({ open, onClose }: Props) {
  const { profile } = useAuth()
  const { data: workspaces = [] } = useWorkspaces()
  const { notifications } = useNotifications(profile?.id)

  const inboxUnread = notifications.filter(
    n => !n.is_read && (!profile?.support_task_id || n.task_id !== profile.support_task_id)
  ).length

  function navItemClass(isActive: boolean) {
    return cn(
      'flex items-center h-11 px-4 mx-2 rounded-[8px] gap-3 transition-colors',
      'text-text-sidebar hover:bg-sidebar-hover hover:text-white text-sm font-medium',
      isActive && 'bg-sidebar-active text-white'
    )
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} />
      )}
      <aside className={cn(
        'fixed top-0 left-0 h-full z-50 w-[280px] flex flex-col bg-sidebar-bg',
        'transition-transform duration-200 ease-out md:hidden',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center justify-between h-14 px-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-accent flex items-center justify-center">
              <span className="text-white text-xs font-bold">K</span>
            </div>
            <span className="text-white font-semibold text-sm">KAMANIN</span>
          </div>
          <button onClick={onClose} className="text-text-sidebar hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="mx-4 h-px bg-white/10 shrink-0" />

        <nav className="flex-1 py-2 flex flex-col gap-0.5 overflow-y-auto">
          <NavLink to="/inbox" onClick={onClose} className={({ isActive }) => navItemClass(isActive)}>
            <div className="relative">
              <Inbox size={18} />
              {inboxUnread > 0 && (
                <span className="absolute -top-[4px] -right-[5px] min-w-[12px] h-[12px] px-[2px] rounded-full bg-cta text-white text-[7px] font-bold flex items-center justify-center">
                  {inboxUnread}
                </span>
              )}
            </div>
            Inbox
          </NavLink>
          <NavLink to="/meine-aufgaben" onClick={onClose} className={({ isActive }) => navItemClass(isActive)}>
            <ClipboardCheck size={18} />
            Meine Aufgaben
          </NavLink>

          <div className="mx-2 my-2 h-px bg-white/10" />
          <div className="px-4 py-1 text-[10px] uppercase tracking-[2px] text-text-sidebar/60 font-medium">
            Workspaces
          </div>

          {workspaces.map(ws => (
            <NavLink
              key={ws.id}
              to={WORKSPACE_ROUTES[ws.module_key] ?? '/'}
              onClick={onClose}
              className={({ isActive }) => navItemClass(isActive)}
            >
              <ClipboardList size={18} />
              {ws.display_name}
            </NavLink>
          ))}

          <div className="mx-2 my-2 h-px bg-white/10" />
          <NavLink to="/hilfe" onClick={onClose} className={({ isActive }) => navItemClass(isActive)}>
            <HelpCircle size={18} />
            Hilfe
          </NavLink>
        </nav>

        <div className="mx-4 h-px bg-white/10 shrink-0" />
        <NavLink to="/konto" onClick={onClose} className="flex items-center h-14 px-4 gap-3 shrink-0 hover:bg-sidebar-hover transition-colors">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-semibold">
                {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </div>
          <div>
            <p className="text-white text-sm font-medium">{profile?.full_name ?? profile?.email}</p>
            <p className="text-text-sidebar text-xs">{profile?.company_name ?? 'Kunde'}</p>
          </div>
        </NavLink>
      </aside>
    </>
  )
}
