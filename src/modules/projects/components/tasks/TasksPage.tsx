import { useNavigate } from 'react-router-dom';
import type { Project, ProjectTask } from '../../types/project';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { getPhaseColor } from '../../lib/phase-colors';

interface TasksPageProps {
  project: Project;
}

export function TasksPage({ project }: TasksPageProps) {
  const needsAttention = project.tasks.filter(t => t.status === 'needs-attention');
  const inProgress = project.tasks.filter(t => t.status === 'in-progress');

  return (
    <ContentContainer width="narrow">
    <div className="p-6 max-[768px]:p-4">
      <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-5">
        Aufgaben
      </h1>

      {needsAttention.length > 0 && (
        <TaskGroup
          label="Wartet auf Sie"
          count={needsAttention.length}
          headerColor="var(--awaiting)"
          headerBg="var(--awaiting-bg)"
          tasks={needsAttention}
          project={project}
        />
      )}

      {inProgress.length > 0 && (
        <TaskGroup
          label="In Bearbeitung"
          count={inProgress.length}
          headerColor={getPhaseColor(2).main}
          headerBg={getPhaseColor(2).light}
          tasks={inProgress}
          project={project}
        />
      )}

      {project.tasks.length === 0 && (
        <p className="text-body text-[var(--text-tertiary)]">Keine Aufgaben vorhanden.</p>
      )}
    </div>
    </ContentContainer>
  );
}

interface TaskGroupProps {
  label: string;
  count: number;
  headerColor: string;
  headerBg: string;
  tasks: ProjectTask[];
  project: Project;
}

function TaskGroup({ label, count, headerColor, headerBg, tasks, project }: TaskGroupProps) {
  const navigate = useNavigate();

  return (
    <div className="mb-5">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-[var(--r-md)] text-xs font-semibold"
        style={{ color: headerColor, background: headerBg }}
      >
        {label}
        <span
          className="inline-flex items-center justify-center text-2xs font-bold text-white rounded-full"
          style={{ background: headerColor, minWidth: 18, height: 18, padding: '0 5px' }}
        >
          {count}
        </span>
      </div>
      <div className="border border-t-0 border-[var(--border-light)] rounded-b-[var(--r-md)] overflow-hidden">
        {tasks.map((task, idx) => {
          // Find the step name
          const stepResult = project.chapters
            .flatMap(ch => ch.steps.map(s => ({ step: s, chapter: ch })))
            .find(({ step }) => step.id === task.stepId);

          return (
            <div
              key={task.id}
              onClick={() => navigate(`/projekte/schritt/${task.stepId}`)}
              className={`flex items-start justify-between gap-2.5 px-3.5 py-3 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors ${
                idx > 0 ? 'border-t border-[var(--border-light)]' : ''
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="w-[8px] h-[8px] rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: task.status === 'needs-attention' ? 'var(--awaiting)' : getPhaseColor(2).main }}
                />
                <div>
                  <div className="text-body font-medium text-[var(--text-primary)] leading-[1.4]">
                    {task.title}
                  </div>
                  {stepResult && (
                    <div className="text-xxs text-[var(--text-tertiary)] mt-0.5">
                      {stepResult.step.title}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
