import { HugeiconsIcon } from '@hugeicons/react';
import { FlashIcon } from '@hugeicons/core-free-icons';
import { useCredits } from '../hooks/useCredits';
import { cn } from '@/shared/lib/utils';

interface Props {
  compact?: boolean;
}

function formatPackageName(name: string | null): string {
  if (!name) return '';
  const cleaned = name.replace(/\s*\d+h\b/gi, '').trim();
  const map: Record<string, string> = {
    basis: 'Basis',
    standard: 'Standard',
    professional: 'Professional',
    premium: 'Premium',
  };
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
      <div className="px-3.5 py-2 text-xxs text-text-tertiary">
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
        <HugeiconsIcon icon={FlashIcon} size={20} className={balanceColor} />
        <span className={cn('text-2xs font-semibold leading-none mt-0.5', balanceColor)}>
          {displayBalance}
        </span>
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 flex items-center gap-2 text-xs">
      <HugeiconsIcon icon={FlashIcon} size={16} className={cn('shrink-0', balanceColor)} />
      <div className="min-w-0">
        <span className={cn('font-bold', balanceColor)}>
          {displayBalance} Credits
        </span>
        <span className={cn('ml-1', balance < 0 ? 'text-red-500' : 'text-text-tertiary')}>
          {balance < 0 ? 'überzogen' : 'verfügbar'}
        </span>
        <div className="text-xxs text-text-tertiary truncate">
          {formatPackageName(packageName)} · {creditsPerMonth}/Monat
        </div>
      </div>
    </div>
  );
}
