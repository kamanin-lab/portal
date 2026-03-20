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
    <section className="rounded-[var(--r-lg)] border border-amber-200 bg-amber-50/70 p-[18px] mb-[18px]">
      <div className="flex items-start justify-between gap-[12px] mb-[14px] max-[768px]:flex-col">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-amber-700 mb-[6px]">Internal operator memory</div>
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[6px]">Author and maintain project memory</h2>
          <p className="text-[13px] text-[var(--text-secondary)] leading-[1.55] max-w-[760px]">
            This operator-only panel can create, edit, and archive shared memory entries through the secure backend write path. It stays hidden unless the signed-in account is explicitly allow-listed.
          </p>
        </div>
        <button
          onClick={() => { setEditingEntry(null); setSheetOpen(true); }}
          className="inline-flex items-center gap-[8px] rounded-[var(--r-sm)] bg-[var(--text-primary)] px-[12px] py-[8px] text-[12px] font-semibold text-white hover:opacity-90"
        >
          <Plus size={14} />
          Add memory
        </button>
      </div>

      <div className="flex flex-wrap gap-[8px] mb-[12px]">
        {(['all', 'internal', 'shared', 'client_visible'] as const).map(option => (
          <button
            key={option}
            onClick={() => setActiveVisibility(option)}
            className={`rounded-full px-[10px] py-[5px] text-[11px] font-semibold border ${activeVisibility === option ? 'border-[var(--text-primary)] bg-white text-[var(--text-primary)]' : 'border-amber-200 bg-white/70 text-[var(--text-secondary)]'}`}
          >
            {option === 'all' ? 'All visibilities' : VISIBILITY_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-[10px]">
        {isLoading ? (
          <div className="rounded-[var(--r-md)] border border-dashed border-amber-200 bg-white/60 px-[14px] py-[16px] text-[12.5px] text-[var(--text-secondary)]">
            Loading internal memory…
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="rounded-[var(--r-md)] border border-dashed border-amber-200 bg-white/60 px-[14px] py-[16px] text-[12.5px] text-[var(--text-secondary)]">
            No memory entries match this filter yet.
          </div>
        ) : filteredEntries.map(entry => (
          <article key={entry.id} className="rounded-[var(--r-md)] border border-amber-100 bg-white px-[14px] py-[14px]">
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
              <div className="flex items-center gap-[8px] shrink-0">
                <button
                  onClick={() => { setEditingEntry(entry); setSheetOpen(true); }}
                  className="inline-flex items-center gap-[6px] rounded-[var(--r-sm)] border border-[var(--border)] bg-white px-[10px] py-[7px] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                >
                  <Pencil size={13} />
                  Edit
                </button>
                <button
                  onClick={() => handleArchive(entry.id)}
                  disabled={isArchiving}
                  className="inline-flex items-center gap-[6px] rounded-[var(--r-sm)] border border-[var(--border)] bg-white px-[10px] py-[7px] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
                >
                  <Archive size={13} />
                  Archive
                </button>
              </div>
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)]">
              Updated {new Date(entry.updated_at).toLocaleDateString('de-DE')}
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
    <span className={`inline-flex items-center gap-[4px] rounded-full px-[8px] py-[3px] text-[10.5px] font-semibold ${toneClass}`}>
      <Icon size={11} />
      {children}
    </span>
  );
}
