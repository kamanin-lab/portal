import { useMemo, type ReactNode } from 'react';
import { BookOpenText, Shield } from 'lucide-react';
import type { Project } from '../../types/project';
import type { MemoryEntry } from '../../types/memory';
import { useProjectMemory } from '../../hooks/useProjectMemory';

interface ProjectContextSectionProps {
  project: Project;
}

const CATEGORY_LABELS: Record<MemoryEntry['category'], string> = {
  profile: 'Profil',
  communication: 'Kommunikation',
  technical_constraint: 'Technische Einschränkung',
  delivery_constraint: 'Liefereinschränkung',
  decision: 'Entscheidung',
  risk: 'Risiko',
  commercial_context: 'Kommerzieller Kontext',
};

const VISIBILITY_LABELS: Record<Exclude<MemoryEntry['visibility'], 'internal'>, string> = {
  shared: 'Geteilt',
  client_visible: 'Für Kunden sichtbar',
};

export function ProjectContextSection({ project }: ProjectContextSectionProps) {
  const { entries } = useProjectMemory(project);
  const visibleEntries = useMemo(
    () => entries.filter(entry => entry.visibility !== 'internal'),
    [entries],
  );

  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 mb-5">
      <div className="flex items-start justify-between gap-3 mb-3.5 max-[768px]:flex-col">
        <div>
          <div className="text-xxs font-bold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-1.5">Projektkontext</div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-1.5">Geteiltes Memory für dieses Projekt</h2>
          <p className="text-body text-[var(--text-secondary)] leading-[1.55] max-w-[760px]">
            Dieser Bereich zeigt nur Kontext an, der im Kundenportal geteilt werden darf. Internes Team-Memory bleibt absichtlich verborgen.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-hover)] px-2.5 py-2 text-xs font-medium text-[var(--text-secondary)]">
          <Shield size={14} />
          Nur Lesezugriff
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {visibleEntries.length === 0 ? (
          <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-3.5 py-4 text-body text-[var(--text-secondary)]">
            Noch kein geteiltes Projekt-Memory sichtbar.
          </div>
        ) : visibleEntries.map(entry => (
          <article key={entry.id} className="rounded-[var(--r-md)] border border-[var(--border-light)] bg-[var(--surface-hover)] px-3.5 py-3.5">
            <div className="flex items-start justify-between gap-3 mb-2 max-[768px]:flex-col">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <Badge>{entry.scope === 'project' ? 'Projekt' : 'Kunde'}</Badge>
                  <Badge>{CATEGORY_LABELS[entry.category]}</Badge>
                  {entry.visibility !== 'internal' ? <Badge tone={entry.visibility}>{VISIBILITY_LABELS[entry.visibility]}</Badge> : null}
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-[1.45] mb-1">{entry.title}</h3>
                <p className="text-body text-[var(--text-secondary)] leading-[1.6] whitespace-pre-wrap">{entry.body}</p>
              </div>
            </div>
            <div className="text-xxs text-[var(--text-tertiary)]">
              Aktualisiert {new Date(entry.updated_at).toLocaleDateString('de-DE')}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'shared' | 'client_visible' }) {
  const toneClass = tone === 'shared'
    ? 'bg-blue-50 text-blue-700'
    : tone === 'client_visible'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-[var(--surface)] text-[var(--text-secondary)]';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-2xs font-semibold ${toneClass}`}>
      <BookOpenText size={11} />
      {children}
    </span>
  );
}
