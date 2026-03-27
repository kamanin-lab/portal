import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ArrowRight } from 'lucide-react'
import { useAuth } from '@/shared/hooks/useAuth'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'
import { useNotifications } from '@/modules/tickets/hooks/useNotifications'
import type { Notification } from '@/modules/tickets/hooks/useNotifications'
import { cn } from '@/shared/lib/utils'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton'
import { EmptyState } from '@/shared/components/common/EmptyState'
import { NotificationAccordionItem } from '@/shared/components/inbox/NotificationAccordionItem'
import { NotificationDetailPanel } from '@/shared/components/inbox/NotificationDetailPanel'
import { TypeBadge } from '@/shared/components/inbox/TypeBadge'
import { formatDate } from '@/shared/components/inbox/notification-utils'

const PAGE_SIZE = 10

export function InboxPage() {
  const { profile } = useAuth()
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const { notifications, isLoading, markAsRead, markAllAsRead } = useNotifications(profile?.id)
  const [selected, setSelected] = useState<Notification | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  // Exclude support task notifications
  const inboxItems = notifications.filter(
    n => !profile?.support_task_id || n.task_id !== profile.support_task_id
  )

  const totalPages = Math.ceil(inboxItems.length / PAGE_SIZE)
  const pageItems = inboxItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const unreadCount = inboxItems.filter(n => !n.is_read).length

  function handleSelect(n: Notification) {
    if (isMobile) {
      setExpandedId(prev => prev === n.id ? null : n.id)
    } else {
      setSelected(n)
    }
    if (!n.is_read) markAsRead([n.id])
  }

  function handleGoToTask(taskId: string) {
    navigate(`/tickets?taskId=${taskId}`)
  }

  return (
    <ContentContainer width="narrow" className="flex h-full min-h-screen">
      {/* Left panel */}
      <div className="w-full md:w-[380px] md:max-w-[380px] flex-shrink-0 border-r border-border flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-text-secondary" />
            <h1 className="text-base font-semibold text-text-primary">Inbox</h1>
            {unreadCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-cta text-white text-2xs font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              <CheckCheck size={14} />
              Alle gelesen
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="px-5 py-4">
              <LoadingSkeleton lines={6} height="44px" />
            </div>
          )}
          {!isLoading && pageItems.length === 0 && (
            <div className="py-8">
              <EmptyState message="Keine Benachrichtigungen vorhanden." icon={<Bell size={24} />} />
            </div>
          )}
          {isMobile ? (
            pageItems.map(n => (
              <NotificationAccordionItem
                key={n.id}
                notification={n}
                isExpanded={expandedId === n.id}
                isSelected={false}
                onSelect={() => handleSelect(n)}
                onGoToTask={handleGoToTask}
              />
            ))
          ) : (
            pageItems.map(n => (
              <button
                key={n.id}
                onClick={() => handleSelect(n)}
                className={cn(
                  'w-full text-left px-5 py-3.5 border-b border-border/50 transition-colors hover:bg-surface-raised',
                  selected?.id === n.id && 'bg-surface-raised',
                  !n.is_read && 'bg-accent/5'
                )}
              >
                <div className="flex items-start gap-2 mb-1">
                  {!n.is_read && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-accent shrink-0" />
                  )}
                  {n.is_read && <span className="mt-1.5 w-2 h-2 shrink-0" />}
                  <span className="text-sm font-medium text-text-primary leading-snug line-clamp-2 flex-1">
                    {n.title}
                  </span>
                  <ArrowRight size={14} className="text-text-tertiary shrink-0 mt-1" />
                </div>
                <div className="flex items-center gap-2 pl-4">
                  <TypeBadge type={n.type} />
                  <span className="text-xs text-text-tertiary">
                    {formatDate(n.created_at)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs text-accent disabled:text-text-tertiary disabled:cursor-not-allowed"
            >
              ← Zurück
            </button>
            <span className="text-xs text-text-tertiary">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs text-accent disabled:text-text-tertiary disabled:cursor-not-allowed"
            >
              Weiter →
            </button>
          </div>
        )}
      </div>

      {/* Right detail panel (desktop only) */}
      <div className="hidden md:flex flex-1 flex-col bg-bg">
        <NotificationDetailPanel notification={selected} onGoToTask={handleGoToTask} />
      </div>
    </ContentContainer>
  )
}
