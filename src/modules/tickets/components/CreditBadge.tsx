import { Zap } from 'lucide-react';

interface Props {
  credits: number | null | undefined;
}

export function CreditBadge({ credits }: Props) {
  if (!credits || credits <= 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600 font-medium">
      <Zap size={11} className="fill-amber-500 stroke-amber-600" />
      {credits % 1 === 0 ? credits : credits.toFixed(1)}
    </span>
  );
}
