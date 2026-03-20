import { RefreshCw } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface Props {
  lastSyncedAt: Date | null
  isSyncing: boolean
  onSync: () => void
}

function formatSyncTime(date: Date | null): string {
  if (!date) return '–'
  return date.toLocaleDateString('de-AT', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function SyncIndicator({ lastSyncedAt, isSyncing, onSync }: Props) {
  return (
    <button
      onClick={onSync}
      disabled={isSyncing}
      className="flex items-center gap-1.5 text-[11.5px] text-text-tertiary hover:text-accent transition-colors cursor-pointer disabled:cursor-not-allowed"
      title="Daten aus ClickUp aktualisieren"
    >
      <RefreshCw
        size={12}
        className={cn('shrink-0', isSyncing && 'animate-spin')}
      />
      <span>
        {isSyncing ? 'Synchronisiert…' : `Synchronisiert: ${formatSyncTime(lastSyncedAt)}`}
      </span>
    </button>
  )
}
