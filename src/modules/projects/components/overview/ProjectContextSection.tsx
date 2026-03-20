import { useMemo, useState } from 'react';
import { Archive, BookOpenText, Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '../../types/project';
import type { MemoryDraft, MemoryEntry } from '../../types/memory';
import { useProjectMemory } from '../../hooks/useProjectMemory';
import { MemoryEntrySheet } from './ProjectMemorySheet';

interface ProjectContextSectionProps {
  project: Project;
}

const CATEGORY_LABELS: Record<MemoryEntry['category'], string> = {
  profile: 'Profile',
  communication: 'Communication',
  technical_constraint: 'Technical constraint',
  delivery_constraint: 'Delivery constraint',
  decision: 'Decision',
  risk: 'Risk',
  commercial_context: 'Commercial context',
};

const VISIBILITY_LABELS: Record<MemoryEntry['visibility'], string> = {
  internal: 'Internal',
  shared: 'Shared',
  client_visible: 'Client visible',
};

export function ProjectContextSection({ project }: ProjectContextSectionProps) {
  const { entries, saveEntry, archiveEntry, isSaving, isArchiving } = useProjectMemory(project);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MemoryEntry | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'all' | MemoryEntry['scope']>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | MemoryEntry['visibility']>('all');

  const filteredEntries = useMemo(() => entries.filter(entry => {
    const scopeMatches = scopeFilter === 'all' || entry.scope === scopeFilter;
    const visibilityMatches = visibilityFilter === 'all' || entry.visibility === visibilityFilter;
    return scopeMatches && visibilityMatches;
  }), [entries, scopeFilter, visibilityFilter]);

  async function handleSave(draft: MemoryDraft, entryId?: string) {
    await saveEntry({ draft, entryId });
    toast.success(entryId ? 'Memory entry updated.' : 'Memory entry created.');
    setSheetOpen(false);
    setEditingEntry(null);
  }

  async function handleArchive(entryId: string) {
    await archiveEntry(entryId);
    toast.success('Memory entry archived.');
  }

  function openCreate() {
    setEditingEntry(null);
    setSheetOpen(true);
  }

  function openEdit(entry: MemoryEntry) {
    setEditingEntry(entry);
    setSheetOpen(true);
  }

  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-[18px] mb-[18px]">
      <div className="flex items-start justify-between gap-[12px] mb-[14px] max-[768px]:flex-col">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-[6px]">Project context</div>
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[6px]">Curated memory for this project</h2>
          <p className="text-[13px] text-[var(--text-secondary)] leading-[1.55] max-w-[760px]">
            Save only durable context that should still matter after the current thread, task, or checkpoint is gone.
            New entries stay internal by default and client editing is intentionally not available in this batch.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-[6px] px-[12px] py-[8px] text-[12.5px] font-semibold rounded-[var(--r-sm)] bg-[var(--text-primary)] text-white transition-opacity hover:opacity-90"
        >
          <Plus size={14} />
          Add memory
        </button>
      </div>

      <div className="flex flex-wrap gap-[8px] mb-[14px]">
        <FilterSelect label="Scope" value={scopeFilter} onChange={setScopeFilter} options={[['all', 'All'], ['project', 'Project'], ['client', 'Client']]} />
        <FilterSelect label="Visibility" value={visibilityFilter} onChange={setVisibilityFilter} options={[['all', 'All'], ['internal', 'Internal'], ['shared', 'Shared'], ['client_visible', 'Client visible']]} />
      </div>

      <div className="flex flex-col gap-[10px]">
        {filteredEntries.length === 0 ? (
          <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[14px] py-[16px] text-[12.5px] text-[var(--text-secondary)]">
            No active memory entries match these filters yet.
          </div>
        ) : filteredEntries.map(entry => (
          <article key={entry.id} className="rounded-[var(--r-md)] border border-[var(--border-light)] bg-[var(--surface-hover)] px-[14px] py-[14px]">
            <div className="flex items-start justify-between gap-[12px] mb-[8px] max-[768px]:flex-col">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[6px] mb-[6px]">
                  <Badge>{entry.scope === 'project' ? 'Project' : 'Client'}</Badge>
                  <Badge>{CATEGORY_LABELS[entry.category]}</Badge>
                  <Badge tone={entry.visibility}>{VISIBILITY_LABELS[entry.visibility]}</Badge>
                </div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)] leading-[1.45] mb-[4px]">{entry.title}</h3>
                <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.6] whitespace-pre-wrap">{entry.body}</p>
              </div>
              <div className="flex items-center gap-[6px] shrink-0">
                <button
                  onClick={() => openEdit(entry)}
                  className="inline-flex items-center gap-[4px] px-[10px] py-[6px] text-[12px] rounded-[var(--r-sm)] border border-[var(--border)] bg-white hover:bg-[var(--surface)]"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => void handleArchive(entry.id)}
                  disabled={isArchiving}
                  className="inline-flex items-center gap-[4px] px-[10px] py-[6px] text-[12px] rounded-[var(--r-sm)] border border-[var(--border)] bg-white hover:bg-[var(--surface)] disabled:opacity-60"
                >
                  <Archive size={12} /> Archive
                </button>
              </div>
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)]">
              Updated {new Date(entry.updated_at).toLocaleDateString('de-DE')} by {entry.updated_by}
            </div>
          </article>
        ))}
      </div>

      <MemoryEntrySheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditingEntry(null); }}
        onSubmit={handleSave}
        initialEntry={editingEntry}
        isSaving={isSaving}
      />
    </section>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <label className="inline-flex items-center gap-[8px] text-[12px] text-[var(--text-secondary)]">
      <span>{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value as T)}
        className="px-[10px] py-[6px] text-[12px] bg-white border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--text-primary)]"
      >
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | MemoryEntry['visibility'] }) {
  const toneClass = tone === 'internal'
    ? 'bg-slate-100 text-slate-700'
    : tone === 'shared'
      ? 'bg-blue-50 text-blue-700'
      : tone === 'client_visible'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-[var(--surface)] text-[var(--text-secondary)]';

  return (
    <span className={`inline-flex items-center gap-[4px] rounded-full px-[8px] py-[3px] text-[10.5px] font-semibold ${toneClass}`}>
      <BookOpenText size={11} />
      {children}
    </span>
  );
}
