import { useState } from 'react';
import { ChevronRight, Upload } from 'lucide-react';
import type { Project, Step } from '../../types/project';
import { getStepById, getTasksForStep, taskStatusLabel } from '../../lib/helpers';
import { getPhaseColor } from '../../lib/phase-colors';
import { StatusBadge } from '@/shared/components/common/StatusBadge';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { TaskComments } from '@/modules/tickets/components/TaskComments';
import { StepActionBar } from './StepActionBar';

type DetailTab = 'overview' | 'files' | 'discussion';

interface StepDetailProps {
  stepId: string;
  project: Project;
}

export function StepDetail({ stepId, project }: StepDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [expandedSections, setExpandedSections] = useState({
    whyItMatters: false,
    whatBecomesFixed: false,
    linkedTasks: false,
  });

  const found = getStepById(stepId, project);
  if (!found) {
    return <div className="p-8 text-[var(--text-secondary)]">Schritt nicht gefunden.</div>;
  }

  const { step, chapter } = found;
  const phaseColor = getPhaseColor(chapter.order);

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'files', label: `Dateien${step.files.length ? ` (${step.files.length})` : ''}` },
    { id: 'discussion', label: `Diskussion${step.commentCount ? ` (${step.commentCount})` : ''}` },
  ];

  return (
    <div className="p-[24px] max-w-[760px] max-[768px]:p-[16px]">
      {/* Header */}
      <div className="mb-[18px]">
        <div className="flex items-center gap-[6px] text-[11.5px] font-medium mb-[6px]" style={{ color: phaseColor.text }}>
          <span
            className="w-[8px] h-[8px] rounded-full"
            style={{ background: phaseColor.main }}
          />
          {chapter.title}
        </div>
        <div className="flex items-start justify-between gap-[12px]">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)] tracking-[-0.02em] leading-[1.2]">
            {step.title}
          </h2>
          <StatusBadge status={step.status} variant="project" size="sm" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[var(--border)] mb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-[16px] py-[9px] text-[12.5px] font-medium border-b-2 transition-all duration-150 cursor-pointer ${
              activeTab === tab.id
                ? 'text-[var(--text-primary)] border-b-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-tertiary)] border-b-transparent hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-[18px]">
        {activeTab === 'overview' && (
          <OverviewTab
            step={step}
            project={project}
            expandedSections={expandedSections}
            onToggle={toggleSection}
          />
        )}
        {activeTab === 'files' && <FilesTab step={step} />}
        {activeTab === 'discussion' && <DiscussionTab step={step} />}
      </div>
    </div>
  );
}


interface OverviewTabProps {
  step: Step;
  project: Project;
  expandedSections: { whyItMatters: boolean; whatBecomesFixed: boolean; linkedTasks: boolean };
  onToggle: (key: 'whyItMatters' | 'whatBecomesFixed' | 'linkedTasks') => void;
}

function OverviewTab({ step, project, expandedSections, onToggle }: OverviewTabProps) {
  const linkedTasks = getTasksForStep(step.id, project);

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Action bar for awaiting_input */}
      {step.status === 'awaiting_input' && (
        <StepActionBar taskId={step.clickupTaskId} projectId={project.id} />
      )}

      {/* Description */}
      <ExpandableSection
        title="Was ist das?"
        body={step.description}
        defaultOpen
        toggleable={false}
      />

      {/* Why it matters */}
      <ExpandableSection
        title="Warum ist das wichtig?"
        body={step.whyItMatters}
        isOpen={expandedSections.whyItMatters}
        onToggle={() => onToggle('whyItMatters')}
      />

      {/* What becomes fixed */}
      <ExpandableSection
        title="Was wird damit festgelegt?"
        body={step.whatBecomesFixed}
        isOpen={expandedSections.whatBecomesFixed}
        onToggle={() => onToggle('whatBecomesFixed')}
      />

      {/* Linked tasks */}
      {linkedTasks.length > 0 && (
        <div className="border border-[var(--border-light)] rounded-[var(--r-md)]">
          <button
            onClick={() => onToggle('linkedTasks')}
            className="w-full flex items-center justify-between px-[14px] py-[12px] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors rounded-t-[var(--r-md)]"
          >
            <span>Verknüpfte Aufgaben ({linkedTasks.length})</span>
            <ChevronRight
              size={15}
              className={`text-[var(--text-tertiary)] transition-transform duration-150 ${expandedSections.linkedTasks ? 'rotate-90' : ''}`}
            />
          </button>
          {expandedSections.linkedTasks && (
            <div className="border-t border-[var(--border-light)] px-[14px] py-[10px] flex flex-col gap-[8px]">
              {linkedTasks.map(t => (
                <div key={t.id} className="flex items-center gap-[10px]">
                  <span
                    className={`w-[8px] h-[8px] rounded-full flex-shrink-0 ${
                      t.status === 'needs-attention' ? 'bg-[var(--awaiting)]' : 'bg-[#2563EB]'
                    }`}
                  />
                  <span className="flex-1 text-[12.5px] text-[var(--text-primary)]">{t.title}</span>
                  <span className={`text-[11px] font-medium ${
                    t.status === 'needs-attention' ? 'text-[var(--awaiting)]' : 'text-[#2563EB]'
                  }`}>
                    {taskStatusLabel(t.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ExpandableSectionProps {
  title: string;
  body: string;
  defaultOpen?: boolean;
  toggleable?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

function ExpandableSection({ title, body, defaultOpen = false, toggleable = true, isOpen, onToggle }: ExpandableSectionProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = toggleable ? (isOpen ?? localOpen) : true;
  const handleToggle = toggleable ? (onToggle ?? (() => setLocalOpen(v => !v))) : undefined;

  return (
    <div className="border border-[var(--border-light)] rounded-[var(--r-md)]">
      <button
        onClick={handleToggle}
        className={`w-full flex items-center justify-between px-[14px] py-[12px] text-[13px] font-medium text-[var(--text-primary)] transition-colors rounded-[var(--r-md)] ${
          toggleable ? 'hover:bg-[var(--surface-hover)] cursor-pointer' : 'cursor-default'
        }`}
      >
        <span>{title}</span>
        {toggleable && (
          <ChevronRight
            size={15}
            className={`text-[var(--text-tertiary)] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--border-light)] px-[14px] py-[12px] text-[13px] text-[var(--text-secondary)] leading-[1.6]">
          {body}
        </div>
      )}
    </div>
  );
}

function FilesTab({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-[4px]">
      {step.files.length === 0 && (
        <EmptyState message="Noch keine Dateien für diesen Schritt." />
      )}
      {step.files.map((f, idx) => (
        <div
          key={idx}
          className="flex items-center gap-[10px] px-[12px] py-[10px] rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
        >
          <div className="w-[32px] h-[32px] rounded-[6px] flex items-center justify-center flex-shrink-0 bg-[var(--accent-light)] text-[var(--accent)]">
            <span className="text-[9px] font-bold uppercase">{f.type}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{f.name}</div>
            <div className="text-[11px] text-[var(--text-tertiary)]">{f.size} · {f.date} · {f.author}</div>
          </div>
        </div>
      ))}

      {/* Drop zone */}
      <div className="mt-[12px] border-2 border-dashed border-[var(--border)] rounded-[var(--r-md)] p-[24px] text-center text-[13px] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:bg-[var(--accent-light)] transition-all cursor-pointer">
        <Upload size={18} className="mx-auto mb-[8px] opacity-60" />
        Dateien hierher ziehen oder <strong className="text-[var(--accent)]">klicken</strong>
      </div>
    </div>
  );
}

function DiscussionTab({ step }: { step: Step }) {
  return <TaskComments taskId={step.clickupTaskId} clientBubbleStyle="solid" />;
}
