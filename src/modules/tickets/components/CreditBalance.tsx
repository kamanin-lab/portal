import { Zap } from 'lucide-react';
import { useCredits } from '../hooks/useCredits';
import { cn } from '@/shared/lib/utils';

interface Props {
  compact?: boolean;
}

function formatPackageName(name: string | null): string {
  if (!name) return '';
  // Strip hour suffixes like "10h", "25h" from package names
  const cleaned = name.replace(/\s*\d+h\b/gi, '').trim();
  const map: Record<string, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
  return map[cleaned.toLowerCase()] ?? cleaned;
}

function getBalanceColor(balance: number, creditsPerMonth: number | null): string {
  if (balance < 0) return 'text-red-500';
  if (!creditsPerMonth || creditsPerMonth <= 0) return 'text-text-secondary';
  const ratio = balance / creditsPerMonth;
  if (ratio > 0.5) return 'text-credit-ok';
  if (ratio >= 0.2) return 'text-credit-warn';
  return 'text-credit-low';
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
        className="flex flex-col items-center justify-center h-12 mx-1.5"
        title={`${displayBalance} Credits ${balance < 0 ? 'überzogen' : 'verfügbar'} - ${formatPackageName(packageName)} - ${creditsPerMonth}/Monat`}
      >
        <Zap size={20} className={cn('fill-current', balanceColor)} />
        <span className={cn('text-[9px] font-semibold leading-none mt-0.5', balanceColor)}>
          {displayBalance}
        </span>
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 flex items-center gap-2 text-[12px]">
      <Zap size={16} className={cn('shrink-0 fill-current', balanceColor)} />
      <div className="min-w-0">
        <span className={cn('font-bold', balanceColor)}>
          {displayBalance} Credits
        </span>
        <span className={cn('ml-1', balance < 0 ? 'text-red-500' : 'text-text-tertiary')}>
          {balance < 0 ? 'überzogen' : 'verfügbar'}
        </span>
        <div className="text-[11px] text-text-tertiary truncate">
          {formatPackageName(packageName)} · {creditsPerMonth}/Monat
        </div>
      </div>
    </div>
  );
}
