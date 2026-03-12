import type { Update, Project } from '../../types/project';
import { UpdateItem } from './UpdateItem';

interface UpdatesFeedProps {
  updates: Update[];
  project?: Project;
  onOpenStep?: (stepId: string) => void;
}

export function UpdatesFeed({ updates, project, onOpenStep }: UpdatesFeedProps) {
  if (updates.length === 0) {
    return (
      <p className="text-[12.5px] text-[var(--text-tertiary)] px-[8px] py-[7px]">
        Noch keine Aktivitäten.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {updates.map((update, idx) => (
        <UpdateItem key={idx} update={update} project={project} onOpenStep={onOpenStep} />
      ))}
    </div>
  );
}
