import { SideSheet } from '@/shared/components/ui/SideSheet'
import { EmptyState } from '@/shared/components/common/EmptyState'
import { TaskCommentsList, TaskCommentComposer } from './TaskComments'
import { useSupportTaskChat } from '../hooks/useSupportTaskChat'
import { useUnreadCounts } from '../hooks/useUnreadCounts'
import { useAuth } from '@/shared/hooks/useAuth'
import { dict } from '../lib/dictionary'

interface SupportSheetProps {
  open: boolean
  onClose: () => void
}

export function SupportSheet({ open, onClose }: SupportSheetProps) {
  const { user } = useAuth()
  const { markAsRead } = useUnreadCounts(user?.id)
  const { isConfigured, supportTaskId } = useSupportTaskChat()

  const canChat = isConfigured && !!supportTaskId

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title="Support Chat"
      footer={canChat ? <TaskCommentComposer taskId={supportTaskId!} /> : undefined}
    >
      <div className="px-5 py-3 border-b border-border text-xs text-text-tertiary">
        Direkter Kanal zum Team für allgemeine Rückfragen und Support.
      </div>
      <div className="p-6 max-[768px]:p-4">
        <div className="flex items-center gap-2.5 mb-5 pb-3.5 border-b border-border">
          <h1 className="text-xl font-semibold text-text-primary tracking-[-0.02em] flex-1">
            {dict.labels.supportTitle}
          </h1>
        </div>
        {canChat ? (
          <TaskCommentsList
            taskId={supportTaskId!}
            onRead={() => markAsRead('support')}
            clientBubbleStyle="light"
            autoScrollOnLoad={true}
          />
        ) : (
          <EmptyState message={dict.labels.noComments} />
        )}
      </div>
    </SideSheet>
  )
}
