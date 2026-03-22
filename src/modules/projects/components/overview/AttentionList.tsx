import type { ProjectAttentionItem } from '../../types/project';

interface AttentionListProps {
  items: ProjectAttentionItem[];
  onOpenStep: (stepId: string) => void;
}

export function AttentionList({ items, onOpenStep }: AttentionListProps) {
  if (items.length === 0) return null;

  return (
    <div className="mb-[18px] rounded-[var(--r-lg)] border border-[var(--border-light)] bg-[var(--surface)] p-[16px]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-[10px]">
        Weitere offene Review-Punkte ({items.length})
      </div>
      <div className="max-h-[220px] overflow-y-auto pr-[4px] flex flex-col gap-[8px]" style={{ scrollbarWidth: 'thin' }}>
        {items.map(item => (
          <button
            key={item.stepId}
            onClick={() => onOpenStep(item.stepId)}
            className="w-full text-left rounded-[var(--r-md)] border border-[var(--border-light)] bg-[var(--surface-hover)] px-[12px] py-[10px] hover:bg-white transition-colors"
          >
            <div className="text-[12.5px] font-semibold text-[var(--text-primary)]">
              {item.portalCta || item.title}
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-[2px]">
              {[item.chapterTitle, item.lastUpdated ? `Zuletzt aktualisiert ${item.lastUpdated}` : null].filter(Boolean).join(' · ')}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
