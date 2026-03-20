import { useMemo, type ReactNode } from 'react';
import { BookOpenText, Shield } from 'lucide-react';
import type { Project } from '../../types/project';
import type { MemoryEntry } from '../../types/memory';
import { useProjectMemory } from '../../hooks/useProjectMemory';

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

const VISIBILITY_LABELS: Record<Exclude<MemoryEntry['visibility'], 'internal'>, string> = {
  shared: 'Shared',
  client_visible: 'Client visible',
};

export function ProjectContextSection({ project }: ProjectContextSectionProps) {
  const { entries } = useProjectMemory(project);
  const visibleEntries = useMemo(
    () => entries.filter(entry => entry.visibility !== 'internal'),
    [entries],
  );

  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-[18px] mb-[18px]">
      <div className="flex items-start justify-between gap-[12px] mb-[14px] max-[768px]:flex-col">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-[6px]">Project context</div>
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[6px]">Shared memory for this project</h2>
          <p className="text-[13px] text-[var(--text-secondary)] leading-[1.55] max-w-[760px]">
            This area shows only context that is safe to share in the client portal. Internal team memory stays out of this surface by design.
          </p>
        </div>
        <div className="inline-flex items-center gap-[6px] rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-hover)] px-[10px] py-[7px] text-[12px] font-medium text-[var(--text-secondary)]">
          <Shield size={14} />
          Read only in this batch
        </div>
      </div>

      <div className="flex flex-col gap-[10px]">
        {visibleEntries.length === 0 ? (
          <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[14px] py-[16px] text-[12.5px] text-[var(--text-secondary)]">
            No shared project memory is visible here yet.
          </div>
        ) : visibleEntries.map(entry => (
          <article key={entry.id} className="rounded-[var(--r-md)] border border-[var(--border-light)] bg-[var(--surface-hover)] px-[14px] py-[14px]">
            <div className="flex items-start justify-between gap-[12px] mb-[8px] max-[768px]:flex-col">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[6px] mb-[6px]">
                  <Badge>{entry.scope === 'project' ? 'Project' : 'Client'}</Badge>
                  <Badge>{CATEGORY_LABELS[entry.category]}</Badge>
                  {entry.visibility !== 'internal' ? <Badge tone={entry.visibility}>{VISIBILITY_LABELS[entry.visibility]}</Badge> : null}
                </div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)] leading-[1.45] mb-[4px]">{entry.title}</h3>
                <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.6] whitespace-pre-wrap">{entry.body}</p>
              </div>
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)]">
              Updated {new Date(entry.updated_at).toLocaleDateString('de-DE')}
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
    <span className={`inline-flex items-center gap-[4px] rounded-full px-[8px] py-[3px] text-[10.5px] font-semibold ${toneClass}`}>
      <BookOpenText size={11} />
      {children}
    </span>
  );
}
