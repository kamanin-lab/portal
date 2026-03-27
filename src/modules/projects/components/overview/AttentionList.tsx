import type { ProjectAttentionItem } from '../../types/project';

interface AttentionListProps {
  items: ProjectAttentionItem[];
  onOpenStep: (stepId: string) => void;
}

export function AttentionList({ items, onOpenStep }: AttentionListProps) {
  if (items.length === 0) return null;

  return (
    <div className="mb-5 rounded-[var(--r-lg)] border border-[var(--border-light)] bg-[var(--surface)] p-4">
      <div className="text-xxs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2.5">
        Weitere offene Review-Punkte ({items.length})
      </div>
      <div className="max-h-[220px] overflow-y-auto pr-1 flex flex-col gap-2" style={{ scrollbarWidth: 'thin' }}>
        {items.map(item => (
          <button
            key={item.stepId}
            onClick={() => onOpenStep(item.stepId)}
            className="w-full text-left rounded-[var(--r-md)] border border-[var(--border-light)] bg-[var(--surface-hover)] px-3 py-2.5 hover:bg-white transition-colors"
          >
            <div className="text-body font-semibold text-[var(--text-primary)]">
              {item.portalCta || item.title}
            </div>
            <div className="text-xxs text-[var(--text-tertiary)] mt-0.5">
              {[item.chapterTitle, item.lastUpdated ? `Zuletzt aktualisiert ${item.lastUpdated}` : null].filter(Boolean).join(' · ')}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
