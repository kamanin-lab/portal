import { HugeiconsIcon } from '@hugeicons/react'
import { MultiplicationSignIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'
import fullLogo from '@/assets/KAMANIN-logo-white.svg'
import { useAuth } from '@/shared/hooks/useAuth'
import { useOrg } from '@/shared/hooks/useOrg'
import { useWorkspaces } from '@/shared/hooks/useWorkspaces'
import { useNotifications } from '@/modules/tickets/hooks/useNotifications'
import { useUnreadCounts } from '@/modules/tickets/hooks/useUnreadCounts'
import { useNeedsAttentionCount } from '@/shared/hooks/useNeedsAttentionCount'
import { SidebarGlobalNav } from './SidebarGlobalNav'
import { SidebarWorkspaces } from './SidebarWorkspaces'
import { SidebarUtilities } from './SidebarUtilities'
import { SidebarUserFooter } from './SidebarUserFooter'

interface Props {
  open: boolean
  onClose: () => void
}

function Divider() {
  return <div className="mx-3 h-px bg-white/10 shrink-0" />
}

export function MobileSidebarOverlay({ open, onClose }: Props) {
  const { profile } = useAuth()
  const { organization } = useOrg()
  const { data: workspaces = [] } = useWorkspaces()
  const { notifications } = useNotifications(profile?.id)
  const { supportUnread } = useUnreadCounts(profile?.id, organization?.support_task_id ?? null)
  const { data: attentionCount = 0 } = useNeedsAttentionCount(profile?.id)

  const inboxNotifications = notifications.filter(
    n => !organization?.support_task_id || n.task_id !== organization.support_task_id
  )
  const inboxUnread = inboxNotifications.filter(n => !n.is_read).length

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} />
      )}
      <aside className={cn(
        'fixed top-0 left-0 h-full z-50 w-[260px] flex flex-col bg-sidebar-bg',
        'transition-transform duration-200 ease-out md:hidden',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo + close */}
        <div className="flex items-center justify-between h-14 px-3.5 shrink-0">
          <img src={fullLogo} alt="KAMANIN" className="h-6 w-auto object-contain" />
          <button onClick={onClose} className="text-text-sidebar hover:text-white transition-colors">
            <HugeiconsIcon icon={MultiplicationSignIcon} size={20} />
          </button>
        </div>

        <Divider />

        {/* Global zone: Inbox + Meine Aufgaben */}
        <SidebarGlobalNav
          expanded={true}
          inboxCount={inboxUnread}
          attentionCount={attentionCount}
          onNavigate={onClose}
        />

        <Divider />

        {/* Workspaces zone */}
        <div className="flex-1 overflow-y-auto">
          <SidebarWorkspaces
            expanded={true}
            workspaces={workspaces}
            supportUnread={supportUnread}
            onNavigate={onClose}
          />
        </div>

        <Divider />

        {/* Utilities zone */}
        <SidebarUtilities expanded={true} supportUnread={supportUnread} onNavigate={onClose} />

        <Divider />

        {/* User footer */}
        <SidebarUserFooter expanded={true} profile={profile} onNavigate={onClose} />
      </aside>
    </>
  )
}
