import { useState } from 'react';
import type { Update, Project } from '../../types/project';
import { UpdateItem } from './UpdateItem';

interface UpdatesFeedProps {
  updates: Update[];
  project?: Project;
  onOpenStep?: (stepId: string) => void;
}

const PAGE_SIZE = 10;

export function UpdatesFeed({ updates, project, onOpenStep }: UpdatesFeedProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (updates.length === 0) {
    return (
      <p className="text-[12.5px] text-[var(--text-tertiary)] px-[8px] py-[7px]">
        Noch keine Aktivitäten.
      </p>
    );
  }

  const visible = updates.slice(0, visibleCount);
  const hasMore = visibleCount < updates.length;

  return (
    <div className="flex flex-col">
      {visible.map((update, idx) => (
        <UpdateItem key={idx} update={update} project={project} onOpenStep={onOpenStep} />
      ))}
      {hasMore && (
        <button
          onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
          className="mt-[8px] px-[14px] py-[7px] text-[12.5px] font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-white/60 rounded-[var(--r-sm)] self-center transition-all duration-150 hover:bg-white hover:border-[var(--text-tertiary)] cursor-pointer"
        >
          Mehr anzeigen
        </button>
      )}
    </div>
  );
}
