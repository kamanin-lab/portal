import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Project } from '../../types/project';
import { ContextStrip } from './ContextStrip';
import { DynamicHero } from './DynamicHero';
import { QuickActions } from './QuickActions';
import { OverviewTabs } from './OverviewTabs';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { StepSheet } from '../StepSheet';
import { SchritteSheet } from '../SchritteSheet';
import { MessageSheet } from '../MessageSheet';
import { UploadSheet } from '../UploadSheet';
import { NewTicketDialog } from '@/modules/tickets/components/NewTicketDialog';
import { interpretProjectOverview } from '../../lib/overview-interpretation';
import { useProjectMemory } from '../../hooks/useProjectMemory';
import { ProjectContextPreview } from './ProjectContextPreview';
import { ProjectContextSection } from './ProjectContextSection';
import { ProjectContextAdminPanel } from './ProjectContextAdminPanel';

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
  const { previewEntries } = useProjectMemory(project);

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

  // Build chapter options for the create-task dialog
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
        {/* 1. Header */}
        <div className="flex items-baseline justify-between gap-[16px] mb-[22px] flex-shrink-0 max-[768px]:flex-col max-[768px]:items-start max-[768px]:mb-[16px]">
          <div>
            <h1 className="text-[1.3rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] max-[768px]:text-[1.15rem]">
              {project.name}
            </h1>
            <p className="text-[var(--text-secondary)] text-[13px] max-[768px]:text-[12px]">
              {project.type} · {project.startDate} — {project.targetDate}
            </p>
          </div>
        </div>

        {/* 2. Context strip */}
        <ContextStrip project={project} onChapterClick={openKapitel} />

        {/* 3. Dynamic hero */}
        <DynamicHero
          project={project}
          onOpenStep={openStep}
          onOpenMessage={() => setMessageOpen(true)}
          onCreateTask={() => setCreateTaskOpen(true)}
        />

        {/* 4. Client attention overview */}
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] gap-[14px] mb-[18px] max-[900px]:grid-cols-1">
          <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-[18px]">
            <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-[8px]">
              Was jetzt Ihre Aufmerksamkeit braucht
            </div>
            <h2 className="text-[18px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[6px]">
              {overview.attention.title}
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)] leading-[1.6] mb-[12px]">
              {overview.attention.description}
            </p>
            {(overview.attention.chapterTitle || overview.attention.lastUpdated) && (
              <p className="text-[11px] text-[var(--text-tertiary)] mb-[12px]">
                {[overview.attention.chapterTitle, overview.attention.lastUpdated ? `Zuletzt aktualisiert ${overview.attention.lastUpdated}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="flex flex-wrap gap-[8px] mb-[12px]">
              {overview.attention.stepId && (
                <button
                  onClick={() => openStep(overview.attention.stepId!)}
                  className="px-[14px] py-[8px] text-[13px] font-semibold text-white rounded-[var(--r-sm)] bg-[var(--text-primary)] transition-opacity hover:opacity-90"
                >
                  {overview.attention.primaryLabel}
                </button>
              )}
              <button
                onClick={() => setMessageOpen(true)}
                className="px-[14px] py-[8px] text-[13px] font-medium rounded-[var(--r-sm)] border border-[var(--border)] bg-white transition-colors hover:bg-[var(--surface-hover)]"
              >
                {overview.attention.supportingLabel}
              </button>
            </div>
            {(overview.attention.whyItMatters || overview.attention.whatBecomesFixed) && (
              <div className="grid grid-cols-2 gap-[10px] max-[700px]:grid-cols-1">
                {overview.attention.whyItMatters && (
                  <div className="rounded-[var(--r-md)] bg-[var(--surface-hover)] px-[12px] py-[10px]">
                    <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-[4px]">Warum das wichtig ist</div>
                    <div className="text-[12px] text-[var(--text-secondary)] leading-[1.5]">{overview.attention.whyItMatters}</div>
                  </div>
                )}
                {overview.attention.whatBecomesFixed && (
                  <div className="rounded-[var(--r-md)] bg-[var(--surface-hover)] px-[12px] py-[10px]">
                    <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-[4px]">Was danach feststeht</div>
                    <div className="text-[12px] text-[var(--text-secondary)] leading-[1.5]">{overview.attention.whatBecomesFixed}</div>
                  </div>
                )}
              </div>
            )}
          </section>

          {previewEntries.length > 0 ? (
            <ProjectContextPreview entries={previewEntries} />
          ) : (
            <aside className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-[18px] flex flex-col gap-[12px]">
              <div>
                <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-[8px]">Aktueller Stand</div>
                <div className="text-[15px] font-semibold text-[var(--text-primary)] mb-[4px]">{overview.currentStateTitle}</div>
                <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.55]">{overview.currentStateDescription}</p>
              </div>
              <div className="rounded-[var(--r-md)] bg-[var(--surface-hover)] px-[12px] py-[10px]">
                <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-[4px]">Worauf das Team wartet</div>
                <div className="text-[12px] text-[var(--text-secondary)] leading-[1.5]">{overview.waitingOnTeamSummary}</div>
              </div>
              <div className="rounded-[var(--r-md)] bg-[var(--surface-hover)] px-[12px] py-[10px]">
                <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-[4px]">Nächster sinnvoller Schritt</div>
                <div className="text-[12px] text-[var(--text-secondary)] leading-[1.5]">{overview.nextStepSummary}</div>
              </div>
            </aside>
          )}
        </div>

        {/* 5. Project context */}
        <ProjectContextSection project={project} />
        <ProjectContextAdminPanel project={project} />

        {/* 6. Quick actions */}
        <QuickActions
          project={project}
          onOpenStep={openStep}
          onOpenMessage={() => setMessageOpen(true)}
          onOpenUpload={() => setUploadOpen(true)}
          onCreateTask={() => setCreateTaskOpen(true)}
        />

        {/* 7. Tabs */}
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
