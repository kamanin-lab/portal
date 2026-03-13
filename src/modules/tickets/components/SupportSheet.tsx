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
    <SideSheet open={open} onClose={onClose} title="Support">
      <div className="h-full flex flex-col">
        <SupportChat onRead={() => markAsRead('support')} />
      </div>
    </SideSheet>
  )
}
