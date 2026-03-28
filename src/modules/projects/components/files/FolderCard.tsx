import { HugeiconsIcon } from '@hugeicons/react';
import { Folder01Icon } from '@hugeicons/core-free-icons';
import { getPhaseColor } from '../../lib/phase-colors';

interface FolderCardProps {
  title: string;
  order: number;
  isSelected: boolean;
  onClick: () => void;
}

export function FolderCard({ title, order, isSelected, onClick }: FolderCardProps) {
  const pc = getPhaseColor(order);

  return (
    <button
      onClick={onClick}
      className="p-3 rounded-[var(--r-md)] border text-left transition-all hover:-translate-y-px"
      style={{
        background: isSelected ? pc.light : 'var(--surface)',
        borderColor: isSelected ? pc.main : 'var(--border)',
      }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <HugeiconsIcon icon={Folder01Icon} size={13} style={{ color: pc.main }} />
        <span className="text-xs font-semibold truncate" style={{ color: pc.text }}>
          {title}
        </span>
      </div>
    </button>
  );
}
