import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import type { Project } from '../../types/project';
import { getStepById } from '../../lib/helpers';
import { getPhaseColor } from '../../lib/phase-colors';
import { StatusBadge } from '@/shared/components/common/StatusBadge';
import { TaskComments } from '@/modules/tickets/components/TaskComments';
import { StepActionBar } from './StepActionBar';

interface StepDetailProps {
  stepId: string;
  project: Project;
  onClose?: () => void;
}

export function StepDetail({ stepId, project, onClose }: StepDetailProps) {
  const found = getStepById(stepId, project);
  if (!found) {
    return <div className="p-8 text-text-secondary">Schritt nicht gefunden.</div>;
  }

  const { step, chapter } = found;
  const phaseColor = getPhaseColor(chapter.order);

  return (
    <div className="p-6 max-w-[760px] max-[768px]:p-4">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 text-xxs font-medium mb-1.5" style={{ color: phaseColor.text }}>
          <span className="w-[8px] h-[8px] rounded-full" style={{ background: phaseColor.main }} />
          {chapter.title}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-text-primary tracking-[-0.02em] leading-[1.2]">
            {step.title}
          </h2>
          <StatusBadge status={step.status} variant="project" size="sm" />
        </div>
      </div>

      {/* Action bar for client review */}
      {step.status === 'awaiting_input' && (
        <div className="mb-4">
          <StepActionBar taskId={step.clickupTaskId} projectId={project.id} onSuccess={onClose} />
        </div>
      )}

      {/* Description */}
      {step.description && step.description.trim() !== '' && (
        <p className="text-body text-text-secondary leading-[1.6] mb-5">{step.description}</p>
      )}

      {/* AI enrichment */}
      {(step.whyItMatters || step.whatBecomesFixed) && (
        <div className="flex flex-col gap-3.5 mb-5">
          <ExpandableSection title="Warum ist das wichtig?" body={step.whyItMatters} />
          <ExpandableSection title="Was wird damit festgelegt?" body={step.whatBecomesFixed} />
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-[var(--border-light)] mb-5" />

      {/* Discussion inline */}
      <TaskComments taskId={step.clickupTaskId} clientBubbleStyle="solid" />
    </div>
  );
}

/* ── Expandable Section ────────────────────────────────────── */

interface ExpandableSectionProps {
  title: string;
  body: string;
  defaultOpen?: boolean;
  toggleable?: boolean;
}

function ExpandableSection({ title, body, defaultOpen = false, toggleable = true }: ExpandableSectionProps) {
  if (!body || body.trim() === '') return null;

  const [open, setOpen] = useState(toggleable ? defaultOpen : true);
  const handleToggle = toggleable ? () => setOpen(v => !v) : undefined;

  return (
    <div className="border border-border-light rounded-[var(--r-md)]">
      <button
        onClick={handleToggle}
        className={`w-full flex items-center justify-between px-3.5 py-3 text-body font-medium text-text-primary transition-colors rounded-[var(--r-md)] ${
          toggleable ? 'hover:bg-surface-hover cursor-pointer' : 'cursor-default'
        }`}
      >
        <span>{title}</span>
        {toggleable && (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={15}
            className={`text-text-tertiary transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        )}
      </button>
      {open && (
        <div className="border-t border-border-light px-3.5 py-3 text-body text-text-secondary leading-[1.6]">
          {body}
        </div>
      )}
    </div>
  );
}
