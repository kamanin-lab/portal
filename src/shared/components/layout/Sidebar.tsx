import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { SidebarLeft01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/shared/lib/utils'
import iconLogo from '@/assets/Icon_transparent_white.svg'
import fullLogo from '@/assets/KAMANIN-logo-white.svg'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { useWorkspaces } from '@/shared/hooks/useWorkspaces'
import { useNotifications } from '@/modules/tickets/hooks/useNotifications'
import { useUnreadCounts } from '@/modules/tickets/hooks/useUnreadCounts'
import { SidebarGlobalNav } from './SidebarGlobalNav'
import { SidebarWorkspaces } from './SidebarWorkspaces'
import { SidebarUtilities } from './SidebarUtilities'
import { SidebarUserFooter } from './SidebarUserFooter'

function Divider() {
  return <div className="mx-3 h-px bg-white/10 shrink-0" />
}

function useNeedsAttentionCount(profileId: string | undefined) {
  return useQuery({
    queryKey: ['needs-attention-count', profileId],
    queryFn: async () => {
      // Fetch all visible tasks
      const { data: tasks } = await supabase
        .from('task_cache')
        .select('clickup_id, status, tags')
        .eq('profile_id', profileId!)
        .eq('is_visible', true)

      if (!tasks) return 0

      // Deduplicate across all 4 tab categories (mirrors MeineAufgabenPage totalCount)
      const uniqueIds = new Set<string>()

      for (const t of tasks) {
        // Kostenfreigabe (awaiting_approval) + Warten auf Freigabe (needs_attention)
        if (t.status === 'client review' || t.status === 'approved') {
          uniqueIds.add(t.clickup_id)
        }
        // Empfehlungen
        if (
          t.status === 'to do' &&
          Array.isArray(t.tags) &&
          t.tags.some((tag: { name: string }) => tag.name === 'recommendation')
        ) {
          uniqueIds.add(t.clickup_id)
        }
      }

      // Nachrichten (unread) — query comment_cache for team messages
      const { data: profile } = await supabase
        .from('profiles')
        .select('support_task_id')
        .eq('id', profileId!)
        .maybeSingle()

      const supportTaskId = profile?.support_task_id ?? null

      const { data: receipts } = await supabase
        .from('read_receipts')
        .select('context_type, last_read_at')
        .eq('profile_id', profileId!)

      const receiptsMap: Record<string, string> = {}
      receipts?.forEach((r: { context_type: string; last_read_at: string }) => {
        receiptsMap[r.context_type] = r.last_read_at
      })

      const { data: comments } = await supabase
        .from('comment_cache')
        .select('task_id, clickup_created_at')
        .eq('profile_id', profileId!)
        .eq('is_from_portal', false)

      comments?.forEach((c: { task_id: string; clickup_created_at: string }) => {
        if (supportTaskId && c.task_id === supportTaskId) return
        const lastRead = receiptsMap[`task:${c.task_id}`]
        if (!lastRead || new Date(c.clickup_created_at) > new Date(lastRead)) {
          uniqueIds.add(c.task_id)
        }
      })

      return uniqueIds.size
    },
    enabled: !!profileId,
    staleTime: 15_000,
  })
}

interface Props {
  expanded: boolean
  onToggle: () => void
}

export function Sidebar({ expanded, onToggle }: Props) {
  const { profile } = useAuth()
  const { data: workspaces = [] } = useWorkspaces()
  const { notifications } = useNotifications(profile?.id)
  const { supportUnread } = useUnreadCounts(profile?.id)
  const { data: attentionCount = 0 } = useNeedsAttentionCount(profile?.id)

  const inboxNotifications = notifications.filter(
    n => !profile?.support_task_id || n.task_id !== profile.support_task_id
  )
  const inboxUnread = inboxNotifications.filter(n => !n.is_read).length

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-200 ease-out',
        'bg-sidebar-bg overflow-hidden group',
        expanded ? 'w-[260px]' : 'w-[56px]'
      )}
    >
      {/* Logo + toggle */}
      <div className="flex items-center h-14 px-3.5 shrink-0">
        {expanded ? (
          <>
            <img src={fullLogo} alt="KAMANIN" className="h-6 w-auto object-contain whitespace-nowrap flex-1" />
            <button
              onClick={onToggle}
              className="shrink-0 ml-2 p-1 text-text-sidebar hover:text-white transition-colors rounded-[6px]"
              title="Seitenleiste einklappen"
            >
              <HugeiconsIcon icon={SidebarLeft01Icon} size={18} />
            </button>
          </>
        ) : (
          <button
            onClick={onToggle}
            className="w-7 h-7 flex items-center justify-center relative"
            title="Seitenleiste ausklappen"
          >
            <img
              src={iconLogo}
              alt="K"
              className="w-7 h-7 object-contain shrink-0 transition-opacity duration-150 group-hover:opacity-0"
            />
            <span className="absolute inset-0 flex items-center justify-center text-text-sidebar opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <HugeiconsIcon icon={SidebarLeft01Icon} size={18} />
            </span>
          </button>
        )}
      </div>

      <Divider />

      {/* Global zone: Inbox + Meine Aufgaben */}
      <SidebarGlobalNav
        expanded={expanded}
        inboxCount={inboxUnread}
        attentionCount={attentionCount}
      />

      <Divider />

      {/* Workspaces zone */}
      <div className="flex-1 overflow-hidden">
        <SidebarWorkspaces
          expanded={expanded}
          workspaces={workspaces}
          supportUnread={supportUnread}
        />
      </div>

      <Divider />

      {/* Utilities zone */}
      <SidebarUtilities expanded={expanded} supportUnread={supportUnread} />

      <Divider />

      {/* User footer */}
      <SidebarUserFooter expanded={expanded} profile={profile} />
    </aside>
  )
}
