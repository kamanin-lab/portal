import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Project } from '../../types/project';
import { interpretProjectOverview } from '../../lib/overview-interpretation';
import { ContextStrip } from './ContextStrip';
import { DynamicHero } from './DynamicHero';
import { AttentionList } from './AttentionList';
import { QuickActions } from './QuickActions';
import { OverviewTabs } from './OverviewTabs';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { StepSheet } from '../StepSheet';
import { SchritteSheet } from '../SchritteSheet';
import { MessageSheet } from '../MessageSheet';
import { UploadSheet } from '../UploadSheet';
import { NewTicketDialog } from '@/modules/tickets/components/NewTicketDialog';

interface OverviewPageProps {
  project: Project;
}

export function OverviewPage({ project }: OverviewPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeStepId = searchParams.get('stepId');
  const activeKapitelId = searchParams.get('kapitelId');
  const [messageOpen, setMessageOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const overview = interpretProjectOverview(project);
  const remainingAttention = overview.attentionList.slice(1);

  function openStep(stepId: string) {
    setSearchParams(prev => { prev.set('stepId', stepId); prev.delete('kapitelId'); return prev }, { replace: true });
  }
  function closeStep() {
    setSearchParams(prev => { prev.delete('stepId'); return prev }, { replace: true });
  }
  function openKapitel(kapitelId: string) {
    setSearchParams(prev => { prev.set('kapitelId', kapitelId); prev.delete('stepId'); return prev }, { replace: true });
  }
  function closeKapitel() {
    setSearchParams(prev => { prev.delete('kapitelId'); return prev }, { replace: true });
  }
  function openStepFromKapitel(stepId: string) {
    setSearchParams(prev => { prev.delete('kapitelId'); prev.set('stepId', stepId); return prev }, { replace: true });
  }

  const chapterOptions = project.chapters
    .filter(ch => ch.clickupCfOptionId)
    .map(ch => ({
      id: ch.id,
      title: ch.title,
      clickup_cf_option_id: ch.clickupCfOptionId!,
    }));

  return (
    <div className="h-full flex flex-col overflow-y-auto px-[32px] py-[28px] max-[1100px]:px-[24px] max-[1100px]:py-[20px] max-[768px]:px-[16px] max-[768px]:py-[16px]">
      <ContentContainer width="narrow">
        <div className="flex items-baseline justify-between gap-[16px] mb-[22px] flex-shrink-0 max-[768px]:flex-col max-[768px]:items-start max-[768px]:mb-[16px]">
          <div>
            <h1 className="text-[1.3rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] max-[768px]:text-[1.15rem]">
              {project.name}
            </h1>
            <p className="text-[var(--text-secondary)] text-[13px] max-[768px]:text-[12px]">
              {project.type} {'\u00B7'} {project.startDate} {'\u2014'} {project.targetDate}
            </p>
          </div>
        </div>

        <ContextStrip project={project} onChapterClick={openKapitel} />

        <DynamicHero
          project={project}
          overview={overview}
          onOpenStep={openStep}
          onOpenMessage={() => setMessageOpen(true)}
          onCreateTask={() => setCreateTaskOpen(true)}
        />

        <AttentionList items={remainingAttention} onOpenStep={openStep} />

        <QuickActions
          overview={overview}
          onOpenStep={openStep}
          onOpenMessage={() => setMessageOpen(true)}
          onOpenUpload={() => setUploadOpen(true)}
          onCreateTask={() => setCreateTaskOpen(true)}
        />

        <OverviewTabs project={project} onOpenStep={openStep} />
      </ContentContainer>

      <SchritteSheet project={project} kapitelId={activeKapitelId} onClose={closeKapitel} onOpenStep={openStepFromKapitel} />
      <StepSheet project={project} stepId={activeStepId} onClose={closeStep} />
      <MessageSheet project={project} open={messageOpen} onClose={() => setMessageOpen(false)} />
      <UploadSheet project={project} open={uploadOpen} onClose={() => setUploadOpen(false)} />

      <NewTicketDialog
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        mode="project"
        listId={project.clickupListId}
        chapters={chapterOptions}
        phaseFieldId={project.clickupPhaseFieldId ?? undefined}
      />
    </div>
  );
}
