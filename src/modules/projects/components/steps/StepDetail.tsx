import type { Project } from '../../types/project';
import { getStepById } from '../../lib/helpers';
import { getPhaseColor } from '../../lib/phase-colors';
import { buildChapterFolder } from '../../lib/slugify';
import { StatusBadge } from '@/shared/components/common/StatusBadge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import { StepOverviewTab } from './StepOverviewTab';
import { StepFilesTab } from './StepFilesTab';
import { StepDiscussionTab } from './StepDiscussionTab';

interface StepDetailProps {
  stepId: string;
  project: Project;
}

export function StepDetail({ stepId, project }: StepDetailProps) {
  const found = getStepById(stepId, project);
  if (!found) {
    return <div className="p-8 text-text-secondary">Schritt nicht gefunden.</div>;
  }

  const { step, chapter } = found;
  const phaseColor = getPhaseColor(chapter.order);
  const chapterFolder = buildChapterFolder(chapter.order, chapter.title);

  return (
    <div className="p-6 max-w-[760px] max-[768px]:p-4">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 text-xxs font-medium mb-1.5" style={{ color: phaseColor.text }}>
          <span
            className="w-[8px] h-[8px] rounded-full"
            style={{ background: phaseColor.main }}
          />
          {chapter.title}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-text-primary tracking-[-0.02em] leading-[1.2]">
            {step.title}
          </h2>
          <StatusBadge status={step.status} variant="project" size="sm" />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-0">
          <TabsTrigger value="overview">Uebersicht</TabsTrigger>
          <TabsTrigger value="files">Dateien</TabsTrigger>
          <TabsTrigger value="discussion">
            Diskussion{step.commentCount ? ` (${step.commentCount})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-5">
          <StepOverviewTab step={step} project={project} />
        </TabsContent>
        <TabsContent value="files" className="pt-5">
          <StepFilesTab
            step={step}
            projectConfigId={project.id}
            chapterFolder={chapterFolder}
          />
        </TabsContent>
        <TabsContent value="discussion" className="pt-5">
          <StepDiscussionTab step={step} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
