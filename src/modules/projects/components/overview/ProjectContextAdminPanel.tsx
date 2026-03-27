import { useMemo, useState } from 'react';
import { BookOpenText, Pencil, Plus, ShieldCheck, Archive } from 'lucide-react';
import type { Project } from '../../types/project';
import type { MemoryEntry } from '../../types/memory';
import { useProjectMemory } from '../../hooks/useProjectMemory';
import { MemoryEntrySheet } from './ProjectMemorySheet';

interface ProjectContextAdminPanelProps {
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

const VISIBILITY_LABELS: Record<MemoryEntry['visibility'], string> = {
  internal: 'Intern',
  shared: 'Geteilt',
  client_visible: 'Für Kunden sichtbar',
};

export function ProjectContextAdminPanel({ project }: ProjectContextAdminPanelProps) {
  const { entries, canManage, saveEntry, archiveEntry, isSaving, isArchiving, isLoading } = useProjectMemory(project, { audience: 'internal', mode: 'manage' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MemoryEntry | null>(null);
  const [activeVisibility, setActiveVisibility] = useState<MemoryEntry['visibility'] | 'all'>('all');

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => activeVisibility === 'all' ? true : entry.visibility === activeVisibility);
  }, [entries, activeVisibility]);

  if (!canManage) return null;

  async function handleSubmit(draft: Parameters<typeof saveEntry>[0]['draft'], entryId?: string) {
    await saveEntry({ draft, entryId });
    setSheetOpen(false);
    setEditingEntry(null);
  }

  async function handleArchive(entryId: string) {
    await archiveEntry(entryId);
  }

  return (
    <section className="rounded-[var(--r-lg)] border border-amber-200 bg-amber-50/70 p-5 mb-5">
      <div className="flex items-start justify-between gap-3 mb-3.5 max-[768px]:flex-col">
        <div>
          <div className="text-xxs font-bold tracking-[0.08em] uppercase text-amber-700 mb-1.5">Internes Operator-Memory</div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-1.5">Projekt-Memory verwalten</h2>
          <p className="text-body text-[var(--text-secondary)] leading-[1.55] max-w-[760px]">
            Dieses Operator-Panel ermöglicht das Erstellen, Bearbeiten und Archivieren von Memory-Einträgen über den sicheren Backend-Schreibpfad. Es bleibt verborgen, sofern das angemeldete Konto nicht explizit freigegeben ist.
          </p>
        </div>
        <button
          onClick={() => { setEditingEntry(null); setSheetOpen(true); }}
          className="inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          <Plus size={14} />
          Eintrag hinzufügen
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(['all', 'internal', 'shared', 'client_visible'] as const).map(option => (
          <button
            key={option}
            onClick={() => setActiveVisibility(option)}
            className={`rounded-full px-2.5 py-1.5 text-xxs font-semibold border ${activeVisibility === option ? 'border-[var(--text-primary)] bg-white text-[var(--text-primary)]' : 'border-amber-200 bg-white/70 text-[var(--text-secondary)]'}`}
          >
            {option === 'all' ? 'Alle Sichtbarkeiten' : VISIBILITY_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {isLoading ? (
          <div className="rounded-[var(--r-md)] border border-dashed border-amber-200 bg-white/60 px-3.5 py-4 text-body text-[var(--text-secondary)]">
            Internes Memory wird geladen…
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="rounded-[var(--r-md)] border border-dashed border-amber-200 bg-white/60 px-3.5 py-4 text-body text-[var(--text-secondary)]">
            Keine Memory-Einträge entsprechen diesem Filter.
          </div>
        ) : filteredEntries.map(entry => (
          <article key={entry.id} className="rounded-[var(--r-md)] border border-amber-100 bg-white px-3.5 py-3.5">
            <div className="flex items-start justify-between gap-3 mb-2 max-[768px]:flex-col">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <Badge>{entry.scope === 'project' ? 'Projekt' : 'Kunde'}</Badge>
                  <Badge>{CATEGORY_LABELS[entry.category]}</Badge>
                  <Badge tone={entry.visibility}>{VISIBILITY_LABELS[entry.visibility]}</Badge>
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-[1.45] mb-1">{entry.title}</h3>
                <p className="text-body text-[var(--text-secondary)] leading-[1.6] whitespace-pre-wrap">{entry.body}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setEditingEntry(entry); setSheetOpen(true); }}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-white px-2.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                >
                  <Pencil size={13} />
                  Bearbeiten
                </button>
                <button
                  onClick={() => handleArchive(entry.id)}
                  disabled={isArchiving}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-white px-2.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
                >
                  <Archive size={13} />
                  Archivieren
                </button>
              </div>
            </div>
            <div className="text-xxs text-[var(--text-tertiary)]">
              Aktualisiert {new Date(entry.updated_at).toLocaleDateString('de-DE')}
            </div>
          </article>
        ))}
      </div>

      <MemoryEntrySheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditingEntry(null); }}
        onSubmit={handleSubmit}
        initialEntry={editingEntry}
        isSaving={isSaving}
      />
    </section>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | MemoryEntry['visibility'] }) {
  const toneClass = tone === 'internal'
    ? 'bg-amber-100 text-amber-800'
    : tone === 'shared'
      ? 'bg-blue-50 text-blue-700'
      : tone === 'client_visible'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-[var(--surface)] text-[var(--text-secondary)]';

  const Icon = tone === 'internal' ? ShieldCheck : BookOpenText;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-2xs font-semibold ${toneClass}`}>
      <Icon size={11} />
      {children}
    </span>
  );
}
