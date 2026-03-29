import type { Project } from '../../types/project';
import { generateNarrative } from '../../lib/helpers';
import { PhaseTimeline } from './PhaseTimeline';

interface ContextStripProps {
  project: Project;
  onChapterClick?: (chapterId: string) => void;
}

export function ContextStrip({ project, onChapterClick }: ContextStripProps) {
  const narrative = generateNarrative(project);
  const { teamWorkingOn } = project;

  return (
    <div className="flex-shrink-0 mb-6 pb-3.5 border-b border-[var(--border-light)]">
      <PhaseTimeline project={project} onChapterClick={onChapterClick} />

      {/* Narrative */}
      <p className="text-body text-[var(--text-secondary)] leading-[1.55] mb-1.5">
        {narrative}
      </p>

      {/* Team status line — only when there is work in progress */}
      {teamWorkingOn.task && (
        <div className="flex items-center gap-1.5 text-xxs text-[var(--text-secondary)]">
          <span
            className="w-[6px] h-[6px] rounded-full bg-[var(--committed)] flex-shrink-0"
          />
          <span>
            Team arbeitet an{' '}
            <strong className="text-[var(--text-primary)] font-medium">
              {teamWorkingOn.task}
            </strong>
            {teamWorkingOn.lastUpdate && (
              <>
                {' '}· Zuletzt aktiv: {teamWorkingOn.lastUpdate}
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
