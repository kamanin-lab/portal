import { HugeiconsIcon } from '@hugeicons/react';
import { FlashIcon } from '@hugeicons/core-free-icons';

interface Props {
  credits: number | null | undefined;
}

export function CreditBadge({ credits }: Props) {
  if (!credits || credits <= 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-text-secondary font-semibold">
      <HugeiconsIcon icon={FlashIcon} size={11} className="text-text-tertiary" />
      {credits % 1 === 0 ? credits : credits.toFixed(1)}
    </span>
  );
}
