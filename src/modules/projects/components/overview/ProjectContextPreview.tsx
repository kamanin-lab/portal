import type { MemoryEntry } from '../../types/memory';

interface ProjectContextPreviewProps {
  entries: MemoryEntry[];
}

const VISIBILITY_COPY: Record<Exclude<MemoryEntry['visibility'], 'internal'>, string> = {
  shared: 'Shared context',
  client_visible: 'Client visible',
};

export function ProjectContextPreview({ entries }: ProjectContextPreviewProps) {
  if (entries.length === 0) return null;

  return (
    <aside className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-[18px] flex flex-col gap-[12px]">
      <div>
        <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-[8px]">Known context</div>
        <div className="text-[15px] font-semibold text-[var(--text-primary)] mb-[4px]">Useful context already agreed or safe to share</div>
        <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.55]">This preview is filtered for client-safe context only. Internal team notes stay off overview surfaces.</p>
      </div>
      {entries.map(entry => (
        <div key={entry.id} className="rounded-[var(--r-md)] bg-[var(--surface-hover)] px-[12px] py-[10px]">
          <div className="flex items-center justify-between gap-[8px] mb-[4px]">
            <div className="text-[11px] font-semibold text-[var(--text-primary)] uppercase tracking-[0.04em]">{entry.category.replace('_', ' ')}</div>
            {entry.visibility !== 'internal' ? (
              <div className="text-[10px] text-[var(--text-tertiary)]">{VISIBILITY_COPY[entry.visibility]}</div>
            ) : null}
          </div>
          <div className="text-[12px] font-medium text-[var(--text-primary)] leading-[1.45] mb-[3px]">{entry.title}</div>
          <div className="text-[12px] text-[var(--text-secondary)] leading-[1.5] line-clamp-3">{entry.body}</div>
        </div>
      ))}
    </aside>
  );
}
