import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { FlashIcon, TimeScheduleIcon, Menu01Icon, MultiplicationSignIcon } from '@hugeicons/core-free-icons'
import { useCredits } from '@/modules/tickets/hooks/useCredits'
import { cn } from '@/shared/lib/utils'

interface MobileHeaderProps {
  title: string
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

function getBalanceColor(balance: number, creditsPerMonth: number | null): string {
  if (balance < 0) return 'text-credit-low'
  if (!creditsPerMonth || creditsPerMonth <= 0) return 'text-text-secondary'
  const ratio = balance / creditsPerMonth
  if (ratio > 0.5) return 'text-credit-ok'
  if (ratio >= 0.2) return 'text-credit-warn'
  return 'text-credit-low'
}

export function MobileHeader({ title, sidebarOpen, onToggleSidebar }: MobileHeaderProps) {
  const { balance, packageName, creditsPerMonth, isLoading } = useCredits()
  const balanceColor = getBalanceColor(balance, creditsPerMonth)
  const displayBalance = balance % 1 === 0 ? String(balance) : balance.toFixed(1)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[52px] bg-surface border-b border-border flex items-center px-4 md:hidden">
      <button
        onClick={onToggleSidebar}
        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-hover transition-colors"
        aria-label="Menü öffnen"
      >
        {sidebarOpen ? <HugeiconsIcon icon={MultiplicationSignIcon} size={20} className="text-text-primary" /> : <HugeiconsIcon icon={Menu01Icon} size={20} className="text-text-primary" />}
      </button>
      <span className="ml-3 font-semibold text-text-primary text-sm">{title}</span>

      {/* Credit balance — right side */}
      {!isLoading && packageName && (
        <Link
          to="/konto"
          className="flex items-center gap-1 ml-auto"
          title="Kreditverlauf"
        >
          <HugeiconsIcon icon={FlashIcon} size={14} className={balanceColor} />
          <span className={cn('text-xs font-semibold', balanceColor)}>
            {displayBalance}
          </span>
          <HugeiconsIcon icon={TimeScheduleIcon} size={13} className="text-accent" />
        </Link>
      )}
    </header>
  )
}
