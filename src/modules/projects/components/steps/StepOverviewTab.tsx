import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Project, Step } from '../../types/project';
import { getTasksForStep, taskStatusLabel } from '../../lib/helpers';
import { StepActionBar } from './StepActionBar';

interface StepOverviewTabProps {
  step: Step;
  project: Project;
}

export function StepOverviewTab({ step, project }: StepOverviewTabProps) {
  const [expandedSections, setExpandedSections] = useState({
    whyItMatters: false,
    whatBecomesFixed: false,
    linkedTasks: false,
  });

  const linkedTasks = getTasksForStep(step.id, project);

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Action bar for awaiting_input */}
      {step.status === 'awaiting_input' && (
        <StepActionBar taskId={step.clickupTaskId} projectId={project.id} />
      )}

      {/* Description */}
      <ExpandableSection title="Was ist das?" body={step.description} defaultOpen toggleable={false} />

      {/* Why it matters */}
      <ExpandableSection
        title="Warum ist das wichtig?"
        body={step.whyItMatters}
        isOpen={expandedSections.whyItMatters}
        onToggle={() => toggleSection('whyItMatters')}
      />

      {/* What becomes fixed */}
      <ExpandableSection
        title="Was wird damit festgelegt?"
        body={step.whatBecomesFixed}
        isOpen={expandedSections.whatBecomesFixed}
        onToggle={() => toggleSection('whatBecomesFixed')}
      />

      {/* Linked tasks */}
      {linkedTasks.length > 0 && (
        <div className="border border-border-light rounded-[var(--r-md)]">
          <button
            onClick={() => toggleSection('linkedTasks')}
            className="w-full flex items-center justify-between px-[14px] py-[12px] text-[13px] font-medium text-text-primary hover:bg-surface-hover transition-colors rounded-t-[var(--r-md)] cursor-pointer"
          >
            <span>Verknuepfte Aufgaben ({linkedTasks.length})</span>
            <ChevronRight
              size={15}
              className={`text-text-tertiary transition-transform duration-150 ${expandedSections.linkedTasks ? 'rotate-90' : ''}`}
            />
          </button>
          {expandedSections.linkedTasks && (
            <div className="border-t border-border-light px-[14px] py-[10px] flex flex-col gap-[8px]">
              {linkedTasks.map(t => (
                <div key={t.id} className="flex items-center gap-[10px]">
                  <span
                    className={`w-[8px] h-[8px] rounded-full flex-shrink-0 ${
                      t.status === 'needs-attention' ? 'bg-awaiting' : 'bg-phase-2'
                    }`}
                  />
                  <span className="flex-1 text-[12.5px] text-text-primary">{t.title}</span>
                  <span className={`text-[11px] font-medium ${
                    t.status === 'needs-attention' ? 'text-awaiting' : 'text-phase-2'
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

/* ── Expandable Section ────────────────────────────────────── */

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
    <div className="border border-border-light rounded-[var(--r-md)]">
      <button
        onClick={handleToggle}
        className={`w-full flex items-center justify-between px-[14px] py-[12px] text-[13px] font-medium text-text-primary transition-colors rounded-[var(--r-md)] ${
          toggleable ? 'hover:bg-surface-hover cursor-pointer' : 'cursor-default'
        }`}
      >
        <span>{title}</span>
        {toggleable && (
          <ChevronRight
            size={15}
            className={`text-text-tertiary transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        )}
      </button>
      {open && (
        <div className="border-t border-border-light px-[14px] py-[12px] text-[13px] text-text-secondary leading-[1.6]">
          {body}
        </div>
      )}
    </div>
  );
}
