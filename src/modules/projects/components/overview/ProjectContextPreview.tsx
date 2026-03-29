import type { MemoryEntry } from '../../types/memory';

interface ProjectContextPreviewProps {
  entries: MemoryEntry[];
}

const VISIBILITY_COPY: Record<Exclude<MemoryEntry['visibility'], 'internal'>, string> = {
  shared: 'Geteilter Kontext',
  client_visible: 'Für Kunden sichtbar',
};

export function ProjectContextPreview({ entries }: ProjectContextPreviewProps) {
  if (entries.length === 0) return null;

  return (
    <aside className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-3">
      <div>
        <div className="text-xxs font-bold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-2">Bekannter Kontext</div>
        <div className="text-md font-semibold text-[var(--text-primary)] mb-1">Bereits abgestimmter oder freigegebener Kontext</div>
        <p className="text-body text-[var(--text-secondary)] leading-[1.55]">Diese Vorschau zeigt nur kundenrelevanten Kontext. Interne Teamnotizen werden hier nicht angezeigt.</p>
      </div>
      {entries.map(entry => (
        <div key={entry.id} className="rounded-[var(--r-md)] bg-[var(--surface-hover)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-xxs font-semibold text-[var(--text-primary)] uppercase tracking-[0.04em]">{entry.category.replace('_', ' ')}</div>
            {entry.visibility !== 'internal' ? (
              <div className="text-2xs text-[var(--text-tertiary)]">{VISIBILITY_COPY[entry.visibility]}</div>
            ) : null}
          </div>
          <div className="text-xs font-medium text-[var(--text-primary)] leading-[1.45] mb-1">{entry.title}</div>
          <div className="text-xs text-[var(--text-secondary)] leading-[1.5] line-clamp-3">{entry.body}</div>
        </div>
      ))}
    </aside>
  );
}
