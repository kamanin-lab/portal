import { Zap } from 'lucide-react';
import { useCredits } from '../hooks/useCredits';
import { cn } from '@/shared/lib/utils';

interface Props {
  compact?: boolean;
}

function formatPackageName(name: string | null): string {
  if (!name) return '';
  const map: Record<string, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
  return map[name.toLowerCase()] ?? name;
}

function getBalanceColor(balance: number, creditsPerMonth: number | null): string {
  if (!creditsPerMonth || creditsPerMonth <= 0) return 'text-text-secondary';
  const ratio = balance / creditsPerMonth;
  if (ratio > 0.5) return 'text-emerald-600';
  if (ratio >= 0.2) return 'text-amber-600';
  return 'text-red-600';
}

export function CreditBalance({ compact = false }: Props) {
  const { balance, packageName, creditsPerMonth, isLoading } = useCredits();

  if (isLoading) return null;

  if (!packageName) {
    if (compact) return null;
    return (
      <div className="px-3.5 py-2 text-[11px] text-text-tertiary">
        Kein Paket aktiv
      </div>
    );
  }

  const balanceColor = getBalanceColor(balance, creditsPerMonth);
  const displayBalance = balance % 1 === 0 ? String(balance) : balance.toFixed(1);

  if (compact) {
    return (
      <div
        className="flex items-center justify-center h-10 mx-1.5"
        title={`${displayBalance} Credits verfügbar - ${formatPackageName(packageName)} - ${creditsPerMonth}/Monat`}
      >
        <Zap size={16} className={cn('fill-current', balanceColor)} />
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 flex items-center gap-2 text-[12px]">
      <Zap size={14} className={cn('shrink-0 fill-current', balanceColor)} />
      <div className="min-w-0">
        <span className={cn('font-semibold', balanceColor)}>
          {displayBalance} Credits
        </span>
        <span className="text-text-tertiary ml-1">
          verfügbar
        </span>
        <div className="text-[11px] text-text-tertiary truncate">
          {formatPackageName(packageName)} · {creditsPerMonth}/Monat
        </div>
      </div>
    </div>
  );
}
