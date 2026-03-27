import { Zap } from 'lucide-react';

interface Props {
  credits: number | null | undefined;
}

export function CreditBadge({ credits }: Props) {
  if (!credits || credits <= 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-credit-warn font-semibold">
      <Zap size={11} className="fill-credit-warn stroke-credit-warn" />
      {credits % 1 === 0 ? credits : credits.toFixed(1)}
    </span>
  );
}
