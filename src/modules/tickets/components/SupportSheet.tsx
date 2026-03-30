import { SideSheet } from '@/shared/components/ui/SideSheet'
import { SupportChat } from './SupportChat'
import { useUnreadCounts } from '../hooks/useUnreadCounts'
import { useAuth } from '@/shared/hooks/useAuth'

interface SupportSheetProps {
  open: boolean
  onClose: () => void
}

export function SupportSheet({ open, onClose }: SupportSheetProps) {
  const { user } = useAuth()
  const { markAsRead } = useUnreadCounts(user?.id)

  return (
    <SideSheet open={open} onClose={onClose} title="Support" managed>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-5 py-3 border-b border-border text-xs text-text-tertiary">
          Direkter Kanal zum Team für allgemeine Rückfragen und Support.
        </div>
        <SupportChat active={open} onRead={() => markAsRead('support')} />
      </div>
    </SideSheet>
  )
}
