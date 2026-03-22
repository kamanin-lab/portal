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
    <div className="p-[24px] max-[768px]:p-[16px]">
      <h1 className="text-[1.2rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[20px]">
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
        <p className="text-[13px] text-[var(--text-tertiary)]">Keine Aufgaben vorhanden.</p>
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
    <div className="mb-[20px]">
      <div
        className="flex items-center gap-[8px] px-[12px] py-[8px] rounded-t-[var(--r-md)] text-[12px] font-semibold"
        style={{ color: headerColor, background: headerBg }}
      >
        {label}
        <span
          className="inline-flex items-center justify-center text-[10px] font-bold text-white rounded-full"
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
              className={`flex items-start justify-between gap-[10px] px-[14px] py-[12px] cursor-pointer hover:bg-[var(--surface-hover)] transition-colors ${
                idx > 0 ? 'border-t border-[var(--border-light)]' : ''
              }`}
            >
              <div className="flex items-start gap-[10px]">
                <span
                  className="w-[8px] h-[8px] rounded-full mt-[5px] flex-shrink-0"
                  style={{ background: task.status === 'needs-attention' ? 'var(--awaiting)' : getPhaseColor(2).main }}
                />
                <div>
                  <div className="text-[13px] font-medium text-[var(--text-primary)] leading-[1.4]">
                    {task.title}
                  </div>
                  {stepResult && (
                    <div className="text-[11px] text-[var(--text-tertiary)] mt-[2px]">
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
